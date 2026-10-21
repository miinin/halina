import { DemoController } from './DemoController.ts';
import { sendState, type Broadcast, type NamedRoomLike, type PlayerPresence } from './net.ts';

const RESEND_MS = 2000;
const MIN_GAP_MS = 150;

/**
 * Host moninpelissä: sama paikallinen pelinjohto kuin demossa, mutta pelaajat tulevat
 * room-kanavan presence-tiloista ja julkinen tila lähetetään kaikille.
 */
export class RoomHost extends DemoController {
  private readonly session = Math.random().toString(36).slice(2, 10);
  private version = 0;
  private lastJson = '';
  private lastSent = 0;
  private pending: ReturnType<typeof setTimeout> | null = null;
  private resend: ReturnType<typeof setInterval>;
  private offPeers: () => void;
  private peerToCid = new Map<string, string>();
  private seenInput = new Map<string, string>();
  sendError: string | null = null;

  constructor(
    readonly room: NamedRoomLike,
    code: string,
    bots: number,
  ) {
    super({ bots, code });
    this.offPeers = room.onPeers(({ peers, left }) => {
      for (const p of left) {
        const cid = this.peerToCid.get(p.peer);
        if (cid) this.setConnected(cid, false);
      }
      for (const p of peers) {
        if (p.isMe) continue;
        const pr = p.presence as Partial<PlayerPresence>;
        if (typeof pr.cid !== 'string' || typeof pr.name !== 'string' || !pr.name.trim()) continue;
        const cid = pr.cid.slice(0, 32);
        if (this.kicked.has(cid)) continue;
        this.peerToCid.set(p.peer, cid);
        this.upsertPlayer(cid, { name: pr.name.trim().slice(0, 12), avatar: String(pr.avatar ?? 'fox').slice(0, 24) }, true);
        const inp = pr.inp;
        if (inp && inp.s === this.state?.stepKey) {
          const key = `${inp.s}:${JSON.stringify(inp.v)}`;
          if (this.seenInput.get(cid) !== key) {
            this.seenInput.set(cid, key);
            this.input(cid, inp.v);
          }
        }
      }
    });
    this.resend = setInterval(() => void this.flush(true), RESEND_MS);
  }

  override dispose() {
    super.dispose();
    this.offPeers();
    clearInterval(this.resend);
    if (this.pending) clearTimeout(this.pending);
    void this.room.leave();
  }

  protected override emit() {
    super.emit();
    this.schedule();
  }

  private payload(): Omit<Broadcast, 'v' | 'hostNow'> {
    const feedback: Record<string, string> = {};
    for (const uid of Object.keys(this.inputs)) {
      const r = this.feedback(uid);
      if (r) feedback[uid] = r;
    }
    return { h: this.session, code: this.code, state: this.state!, roster: this.roster, feedback, kicked: [...this.kicked] };
  }

  private schedule() {
    if (this.pending) return;
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - this.lastSent));
    this.pending = setTimeout(() => {
      this.pending = null;
      void this.flush(false);
    }, wait);
  }

  private async flush(force: boolean) {
    if (!this.state) return;
    const p = this.payload();
    const json = JSON.stringify(p);
    if (json !== this.lastJson) {
      this.lastJson = json;
      this.version++;
    } else if (!force) return;
    this.lastSent = Date.now();
    try {
      await sendState(this.room, { ...p, v: this.version, hostNow: Date.now() });
      if (this.sendError) {
        this.sendError = null;
        super.emit();
      }
    } catch (e) {
      const code = (e as { code?: string }).code ?? String(e);
      if (this.sendError !== code) {
        this.sendError = code;
        super.emit();
      }
    }
  }
}

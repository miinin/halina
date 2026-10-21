import { useState } from 'react';
import { t } from './i18n/fi.ts';
import { normalizeCode } from './lib/room.ts';
import { Button } from './components/ui.tsx';

export function Home() {
  const [code, setCode] = useState('');
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-8 px-4 py-10">
      <header className="text-center">
        <h1 className="text-6xl font-black tracking-tight">
          H<span className="text-accent2">ä</span>lin<span className="text-accent">ä</span>
        </h1>
        <p className="mt-2 text-white/70">{t.tagline}</p>
      </header>
      <form
        className="flex flex-col gap-3 rounded-3xl bg-white/5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          location.href = `/play?code=${normalizeCode(code)}${location.search.includes('devPlayer') ? '&' + location.search.slice(1) : ''}`;
        }}
      >
        <label className="text-sm font-semibold text-white/70" htmlFor="code">
          {t.join.code}
        </label>
        <input
          id="code"
          value={code}
          onChange={(e) => setCode(normalizeCode(e.target.value))}
          placeholder="ABCD"
          autoCapitalize="characters"
          autoComplete="off"
          className="h-16 rounded-xl bg-white px-4 text-center text-4xl font-black tracking-[0.4em] text-ink uppercase"
        />
        <Button type="submit" disabled={code.length !== 4}>
          {t.home.join}
        </Button>
      </form>
      <div className="text-center">
        <a href="/host" className="font-bold text-accent underline underline-offset-4">
          {t.home.host}
        </a>
        <p className="mt-1 text-sm text-white/50">{t.home.hostHint}</p>
      </div>
    </main>
  );
}

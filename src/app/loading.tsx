export default function Loading() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1480px] items-center gap-4 px-5 py-4">
          <div className="h-10 w-36 rounded bg-slate-200" />
          <div>
            <div className="h-4 w-44 rounded bg-slate-200" />
            <div className="mt-2 h-3 w-72 rounded bg-slate-100" />
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1480px] gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_430px]">
        <section className="min-h-[560px] rounded-lg border border-slate-200 bg-white">
          <div className="grid h-full place-items-center text-sm font-black text-[#0b4f9c]">正在恢复本机模型工具</div>
        </section>
        <aside className="grid content-start gap-3">
          <div className="h-56 rounded-lg border border-slate-200 bg-white" />
          <div className="h-80 rounded-lg border border-slate-200 bg-white" />
        </aside>
      </div>
    </main>
  );
}

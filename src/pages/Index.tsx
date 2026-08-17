import { CastleMap } from "@/components/castle-map/CastleMap";

const Index = () => {
  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex h-14 shrink-0 items-center border-b border-border bg-background px-4">
        <span className="text-base font-semibold text-foreground">
          Les chââteaux de Roro
        </span>
      </header>
      <main className="relative min-h-0 flex-1">
        <CastleMap />
      </main>
    </div>
  );
};

export default Index;

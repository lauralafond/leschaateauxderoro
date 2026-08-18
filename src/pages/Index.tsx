import { CastleMap } from "@/components/castle-map/CastleMap";
import logoKnight from "@/assets/logo-knight.jpg";

const Index = () => {
  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border bg-background px-4">
        <img
          src={logoKnight}
          alt="Les chââteaux de Roro logo"
          className="h-9 w-9 rounded-full object-cover ring-1 ring-border"
        />
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

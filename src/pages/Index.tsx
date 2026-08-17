import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { CastleMap } from "@/components/castle-map/CastleMap";

const Index = () => {
  const { t } = useTranslation();

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
        <span className="text-base font-semibold text-foreground">
          {t("castle.appTitle")}
        </span>
        <LanguageSwitcher className="h-9" />
      </header>
      <main className="relative min-h-0 flex-1">
        <CastleMap />
      </main>
    </div>
  );
};

export default Index;

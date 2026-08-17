import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { routers } from "./router";

const queryClient = new QueryClient();

// Matches Vite's `base` (see vite.config.ts): "/" for Enter's own hosting,
// "/leschaateauxderoro" for the GitHub Pages build, so client-side route
// matching stays correct under either deployment's URL prefix.
const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || undefined;

const App = () => {
  const router = createBrowserRouter(routers, { basename });
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

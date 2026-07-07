import { createFileRoute } from "@tanstack/react-router";

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  component: Index,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
function Index() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <main className="text-center">
        <h1 className="text-4xl font-semibold text-foreground">Hello World</h1>
        <p className="mt-3 text-muted-foreground">Your sample app is ready.</p>
      </main>
    </div>
  );
}

export default function ChatIndexPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-muted-foreground p-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
          <span className="text-3xl">🤖</span>
        </div>
        <h2 className="text-xl font-semibold text-foreground">Welcome to DevMind</h2>
        <p className="text-sm">
          Select an existing conversation from the sidebar or start a new one to begin.
        </p>
      </div>
    </div>
  );
}

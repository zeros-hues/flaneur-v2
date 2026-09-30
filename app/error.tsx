"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page">
      <p className="page__main quiet">
        Something went wrong loading this page.{" "}
        <button type="button" className="textlink" onClick={reset}>
          Try again.
        </button>
      </p>
    </main>
  );
}

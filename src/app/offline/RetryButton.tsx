"use client";

export function RetryButton() {
  return (
    <button onClick={() => location.reload()} className="btn-primary mt-8">
      Try again
    </button>
  );
}

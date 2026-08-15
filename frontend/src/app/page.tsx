export default async function Home() {
  const response = await fetch("http://127.0.0.1:8000/health", {
    cache: "no-store",
  });

  const data = await response.json();

  return (
    <main>
      <h1>WakeCast</h1>
      <p>Backend status: {data.status}</p>
    </main>
  );
}
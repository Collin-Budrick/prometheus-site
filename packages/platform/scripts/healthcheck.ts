async function main() {
  const url = `http://localhost:${process.env.API_PORT ?? '4000'}/health`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error('Unhealthy')
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})

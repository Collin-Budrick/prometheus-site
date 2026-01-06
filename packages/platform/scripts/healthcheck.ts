import { request } from 'undici'

async function main() {
  const url = `http://localhost:${process.env.API_PORT ?? '4000'}/health`
  const res = await request(url)
  if (res.statusCode !== 200) {
    throw new Error('Unhealthy')
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})

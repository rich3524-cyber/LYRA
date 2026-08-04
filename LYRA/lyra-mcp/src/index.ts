import { createApp } from './http'

const port = Number(process.env.PORT) || 3100
const app = createApp()
app.listen(port, () => {
  console.log(`lyra-mcp listening on port ${port}`)
})

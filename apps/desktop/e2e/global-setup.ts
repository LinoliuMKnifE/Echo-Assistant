import { createServer } from 'vite';

export default async function setup() {
  const server = await createServer({
    configLoader: 'runner',
    server: { host: '127.0.0.1', port: 1420, strictPort: true },
  });
  await server.listen();
  return async () => {
    await server.close();
  };
}

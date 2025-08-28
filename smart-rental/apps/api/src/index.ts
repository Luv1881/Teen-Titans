import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import pino from 'pino-http';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(helmet());
app.use(compression());
app.use(pino());

app.get('/', (req, res) => {
  res.send('Hello from the API!');
});

io.on('connection', (socket) => {
  console.log('a user connected');
  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});

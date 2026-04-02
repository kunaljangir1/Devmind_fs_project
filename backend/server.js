const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT;
if (!PORT) throw new Error("PORT environment variable must be set.");

app.use(cors());
app.use(express.json());

// Routes
const authRoutes = require('./routes/auth');
const chatsRoutes = require('./routes/chats');

app.use('/api/auth', authRoutes);
app.use('/api/chats', chatsRoutes);

app.get('/', (req, res) => {
  res.send('DevMind API is running');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

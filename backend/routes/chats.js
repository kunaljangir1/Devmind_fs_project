const express = require('express');
const router = express.Router();
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Get all chats for a user
router.get('/', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM chats WHERE user_id = ? ORDER BY created_at DESC');
    const chats = stmt.all(req.user.id);
    res.json(chats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching chats' });
  }
});

// Create a new chat
router.post('/', (req, res) => {
  try {
    const { title } = req.body;
    const stmt = db.prepare('INSERT INTO chats (user_id, title) VALUES (?, ?)');
    const info = stmt.run(req.user.id, title || 'New Chat');
    res.status(201).json({ id: info.lastInsertRowid, title: title || 'New Chat' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error creating chat' });
  }
});

// Get messages for a specific chat
router.get('/:id/messages', (req, res) => {
  try {
    // verify chat belongs to user
    const chatStmt = db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?');
    const chat = chatStmt.get(req.params.id, req.user.id);
    
    if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
    }

    const msgStmt = db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC');
    const messages = msgStmt.all(req.params.id);
    res.json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching messages' });
  }
});

// Post a new message and get an AI response
router.post('/:id/messages', async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content is required' });

  try {
    // Verify chat ownership
    const chatStmt = db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?');
    const chat = chatStmt.get(req.params.id, req.user.id);
    
    if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
    }

    // Insert User Message
    const stmt = db.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)');
    stmt.run(req.params.id, 'user', content);

    // ── Old Raiden API integration (commented out) ──
    // let aiResponse = "Error communicating with AI.";
    // try {
    //   const apiUrlString = process.env.RAIDEN_API_URL;
    //   if (!apiUrlString) {
    //      console.error("Missing RAIDEN_API_URL in .env");
    //      throw new Error("Missing API config");
    //   }
    //   const apiUrl = new URL(apiUrlString);
    //   apiUrl.searchParams.append('text', content);
    //   const response = await fetch(apiUrl.toString());
    //   if (response.ok) {
    //     const data = await response.json();
    //     if (data && data.success) {
    //       aiResponse = data.generated_text;
    //     }
    //   }
    // } catch (apiError) {
    //   console.error('Raiden API Error:', apiError);
    // }

    // ── New Gemini AI integration ──
    let aiResponse = "Error communicating with AI.";
    try {
      const { GoogleGenAI } = require("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const geminiResult = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: content,
      });
      if (geminiResult.text) {
        aiResponse = geminiResult.text;
      }
    } catch (apiError) {
      console.error('Gemini API Error:', apiError);
    }
    
    const stmtAi = db.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)');
    const aiInfo = stmtAi.run(req.params.id, 'ai', aiResponse);

    res.status(201).json([
        { role: 'user', content },
        { id: aiInfo.lastInsertRowid, role: 'ai', content: aiResponse }
    ]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error sending message' });
  }
});

// Rename a chat
router.patch('/:id', (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
    const chatStmt = db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?');
    const chat = chatStmt.get(req.params.id, req.user.id);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    db.prepare('UPDATE chats SET title = ? WHERE id = ?').run(title.trim(), req.params.id);
    res.json({ id: req.params.id, title: title.trim() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error updating chat' });
  }
});

// Delete a chat and all its messages
router.delete('/:id', (req, res) => {
  try {
    const chatStmt = db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?');
    const chat = chatStmt.get(req.params.id, req.user.id);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    db.prepare('DELETE FROM messages WHERE chat_id = ?').run(req.params.id);
    db.prepare('DELETE FROM chats WHERE id = ?').run(req.params.id);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error deleting chat' });
  }
});

module.exports = router;


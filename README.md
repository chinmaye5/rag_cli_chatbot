# 🧠 RAG CLI Chatbot

A CLI-based chatbot that uses Retrieval-Augmented Generation (RAG) with Google Gemini API for embedding and question-answering, and Qdrant as the vector database.

---

## 🚀 Features

- ✅ Chunk and embed text using Gemini Embeddings API
- ✅ Store vector embeddings in Qdrant
- ✅ Perform semantic search to retrieve relevant chunks
- ✅ Use Gemini LLM to answer questions with context
- ✅ Fully CLI-based chat experience

---

## 🛠️ Tech Stack

- **Node.js**
- **Qdrant** – Vector search engine
- **Gemini API** – Embedding + LLM
- **dotenv** – Manage secrets
- **Axios** – API calls

---

⚙️ Setup
1. Clone the repository
git clone https://github.com/chinmaye5/rag_cli_chatbot.git
cd rag_cli_chatbot
2. Install dependencies
npm install
3. Add your .env file
Create a .env file in the root directory:

GEMINI_API_KEY=your_gemini_api_key
QDRANT_API_KEY=your_qdrant_api_key
QDRANT_HOST=https://your-qdrant-instance.com
COLLECTION_NAME=your_collection_name
4. Add your text file
Place the file you want to chat with as text.txt in the project root.

🧪 Run the Chatbot
node app.js
You’ll see:

💬 You can now chat with your document. Type 'exit' to quit.
📝 Example
You: What is this document about?
🤖 Gemini: This document talks about...
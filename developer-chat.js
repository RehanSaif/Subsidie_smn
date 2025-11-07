/**
 * ============================================================================
 * ISDE DEVELOPER CHAT - RAG-BASED AI ASSISTANT
 * ============================================================================
 *
 * Standalone tool voor developers om vragen te stellen over de codebase.
 * Gebruikt RAG (Retrieval-Augmented Generation) voor dynamische antwoorden.
 *
 * ARCHITECTURE:
 * 1. Load all source files into memory at page load
 * 2. When user asks question: Send ALL files + question to LLM
 * 3. LLM generates answer based on actual code, not hardcoded responses
 *
 * SIMPEL & EFFECTIEF: Geen complexe file selection - gewoon altijd alle files laden!
 */

// ============================================================================
// FILE MANIFEST
// ============================================================================

const FILE_MANIFEST = [
  // Core extension files
  { name: 'manifest.json', path: './manifest.json', type: 'config' },
  { name: 'config.js', path: './config.js', type: 'code' },
  { name: 'sanitization.js', path: './sanitization.js', type: 'code' },
  { name: 'background.js', path: './background.js', type: 'code' },
  { name: 'content.js', path: './content.js', type: 'code' },
  { name: 'popup.js', path: './popup.js', type: 'code' },
  { name: 'popup.html', path: './popup.html', type: 'ui' },
  { name: 'status-panel.js', path: './status-panel.js', type: 'code' },

  // Documentation
  { name: 'README.md', path: './README.md', type: 'docs' },
  { name: 'CHANGELOG.md', path: './docs/CHANGELOG.md', type: 'docs' },
  { name: 'TECHNISCHE_OVERDRACHT.md', path: './docs/TECHNISCHE_OVERDRACHT.md', type: 'docs' },
  { name: 'TROUBLESHOOTING.md', path: './docs/TROUBLESHOOTING.md', type: 'docs' },
];

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let filesCache = {}; // { filename: content }
let conversationHistory = [];
let isProcessing = false;
let filesLoaded = false;

// ============================================================================
// FILE LOADING
// ============================================================================

/**
 * Laad alle source files in memory.
 * Dit gebeurt eenmalig bij page load.
 */
async function loadAllFiles() {
  console.log('📚 Loading source files...');

  for (const file of FILE_MANIFEST) {
    try {
      const response = await fetch(file.path);
      if (response.ok) {
        const content = await response.text();
        filesCache[file.name] = {
          content,
          type: file.type,
          lines: content.split('\n').length
        };
        console.log(`✅ Loaded ${file.name} (${filesCache[file.name].lines} lines)`);
      } else {
        console.warn(`⚠️ Could not load ${file.name}: ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ Error loading ${file.name}:`, error);
    }
  }

  filesLoaded = true;
  console.log(`✅ Loaded ${Object.keys(filesCache).length}/${FILE_MANIFEST.length} files`);

  // Update UI
  updateFilesLoadedStatus();
}

/**
 * Update UI om aan te geven dat files geladen zijn.
 */
function updateFilesLoadedStatus() {
  const chatContainer = document.getElementById('chatHistory');
  const emptyState = chatContainer.querySelector('.empty-state');

  if (emptyState) {
    const filesCount = Object.keys(filesCache).length;
    emptyState.innerHTML = `
      <div class="empty-state-icon">💬</div>
      <div class="empty-state-title">Stel een vraag over de codebase</div>
      <div class="empty-state-text">
        ✅ ${filesCount} source files geladen<br>
        Gebruik quick actions hierboven of type je eigen vraag hieronder
      </div>
    `;
  }
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Haal Mistral API key op uit input field.
 */
function getMistralKey() {
  const key = document.getElementById('mistralKey').value.trim();
  if (!key) {
    throw new Error('Mistral API key is vereist. Voer je key in bovenaan de pagina.');
  }
  return key;
}

/**
 * Stuur request naar Mistral AI.
 */
async function callMistralAPI(messages, maxTokens = 2000, temperature = 0.3) {
  const apiKey = getMistralKey();

  const response = await fetch(CONFIG.getMistralUrl('chat/completions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: CONFIG.MISTRAL_MODELS.EXTRACTION, // mistral-small-latest
      messages,
      max_tokens: maxTokens,
      temperature
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mistral API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Geef antwoord op vraag met file context.
 */
async function answerWithContext(question, relevantFiles) {
  console.log('💬 Generating answer with full codebase context...');

  // Build context van alle files - VOLLEDIG, geen truncation
  const context = relevantFiles.map(filename => {
    const file = filesCache[filename];

    return `
==================================================
FILE: ${filename} (${file.type})
LINES: ${file.lines}
==================================================
${file.content}
`;
  }).join('\n\n');

  const systemPrompt = `Je bent een expert developer assistant voor de ISDE Chrome Extension codebase.

Je taak is om developer vragen te beantwoorden op basis van de daadwerkelijke source code die je krijgt.

ANTWOORD RICHTLIJNEN:
- Geef CONCRETE antwoorden met file + line number references
- Citeer relevante code snippets (gebruik \`\`\`javascript blocks)
- Geef stap-voor-stap instructies waar relevant
- Wees PRAKTISCH en PRECIES
- Als je iets niet weet op basis van de gegeven files, zeg dat eerlijk

FORMAAT:
1. Begin met direct antwoord op de vraag
2. Geef file + line references (bijv. "zie popup.js regel 150-180")
3. Voeg code snippets toe waar nuttig
4. Eindig met praktische tips/next steps indien relevant`;

  const userPrompt = `SOURCE CODE CONTEXT:
${context}

DEVELOPER VRAAG:
${question}

Beantwoord de vraag op basis van bovenstaande source code.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-6), // Laatste 3 exchanges voor context
    { role: 'user', content: userPrompt }
  ];

  const response = await callMistralAPI(messages, 4000, 0.3); // Meer tokens voor uitgebreide antwoorden

  return response;
}

/**
 * Hoofdfunctie: Beantwoord developer vraag met RAG.
 */
async function answerQuestion(question) {
  // Laad gewoon ALLE files - simpeler en werkt altijd!
  const allFiles = Object.keys(filesCache);

  console.log('📚 Using all files:', allFiles.length);

  // Genereer antwoord met volledige codebase context
  const answer = await answerWithContext(question, allFiles);

  return {
    answer,
    filesUsed: allFiles
  };
}

// ============================================================================
// UI FUNCTIONS
// ============================================================================

/**
 * Voeg message toe aan chat history.
 */
function addMessageToUI(role, content, metadata = null) {
  const chatHistory = document.getElementById('chatHistory');

  // Remove empty state als dit het eerste bericht is
  const emptyState = chatHistory.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = `message message-${role}`;

  const roleDiv = document.createElement('div');
  roleDiv.className = 'message-role';
  roleDiv.textContent = role === 'user' ? 'Developer' : 'AI Assistant';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  // Format code blocks
  let formattedContent = content;

  // Format ```language blocks
  formattedContent = formattedContent.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre><code>${escapeHtml(code.trim())}</code></pre>`;
  });

  // Format inline `code`
  formattedContent = formattedContent.replace(/`([^`]+)`/g, '<code>$1</code>');

  contentDiv.innerHTML = formattedContent;

  messageDiv.appendChild(roleDiv);
  messageDiv.appendChild(contentDiv);

  // Add metadata (files used) indien beschikbaar
  if (metadata && metadata.filesUsed) {
    const metaDiv = document.createElement('div');
    metaDiv.className = 'message-metadata';
    metaDiv.style.cssText = 'margin-top: 10px; font-size: 11px; color: #858585; font-style: italic;';
    metaDiv.textContent = `📁 Context: ${metadata.filesUsed.join(', ')}`;
    messageDiv.appendChild(metaDiv);
  }

  chatHistory.appendChild(messageDiv);

  // Scroll to bottom
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

/**
 * Voeg error message toe.
 */
function addErrorToUI(error) {
  const chatHistory = document.getElementById('chatHistory');

  const messageDiv = document.createElement('div');
  messageDiv.className = 'message message-error';

  const roleDiv = document.createElement('div');
  roleDiv.className = 'message-role';
  roleDiv.textContent = 'Error';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.textContent = error;

  messageDiv.appendChild(roleDiv);
  messageDiv.appendChild(contentDiv);
  chatHistory.appendChild(messageDiv);

  chatHistory.scrollTop = chatHistory.scrollHeight;
}

/**
 * Escape HTML om XSS te voorkomen.
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Toggle loading state.
 */
function setLoading(loading) {
  isProcessing = loading;
  document.getElementById('loading').classList.toggle('active', loading);
  document.getElementById('sendBtn').disabled = loading;
  document.getElementById('userInput').disabled = loading;
}

// ============================================================================
// CHAT HANDLER
// ============================================================================

/**
 * Verwerk user vraag met RAG.
 */
async function handleUserQuestion(question) {
  if (!question.trim()) return;
  if (isProcessing) return;

  if (!filesLoaded) {
    addErrorToUI('Files zijn nog niet geladen. Wacht even en probeer opnieuw.');
    return;
  }

  try {
    // Add user message to UI
    addMessageToUI('user', question);

    // Add to conversation history
    conversationHistory.push({ role: 'user', content: question });

    // Show loading
    setLoading(true);

    // Get AI response met RAG
    const result = await answerQuestion(question);

    // Add assistant message to UI
    addMessageToUI('assistant', result.answer, { filesUsed: result.filesUsed });

    // Add to conversation history (keep last 8 messages for context)
    conversationHistory.push({
      role: 'assistant',
      content: result.answer
    });

    if (conversationHistory.length > 8) {
      conversationHistory = conversationHistory.slice(-8);
    }

  } catch (error) {
    console.error('Error:', error);
    addErrorToUI(error.message);
  } finally {
    setLoading(false);
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const sendBtn = document.getElementById('sendBtn');
  const userInput = document.getElementById('userInput');

  // Load all source files
  await loadAllFiles();

  // Send button click
  sendBtn.addEventListener('click', async () => {
    const question = userInput.value.trim();
    if (question) {
      userInput.value = '';
      await handleUserQuestion(question);
    }
  });

  // Enter key (Shift+Enter voor newline)
  userInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const question = userInput.value.trim();
      if (question) {
        userInput.value = '';
        await handleUserQuestion(question);
      }
    }
  });

  // Quick action buttons
  const quickBtns = document.querySelectorAll('.quick-btn');
  quickBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const question = btn.getAttribute('data-q');
      await handleUserQuestion(question);
    });
  });

  // Load API key from localStorage if available
  const savedKey = localStorage.getItem('mistralApiKey');
  if (savedKey) {
    document.getElementById('mistralKey').value = savedKey;
  }

  // Save API key to localStorage on change
  document.getElementById('mistralKey').addEventListener('change', (e) => {
    localStorage.setItem('mistralApiKey', e.target.value);
  });

  console.log('✅ Developer Chat initialized (RAG-based)');
  console.log('📚 Loaded', Object.keys(filesCache).length, 'source files');
});

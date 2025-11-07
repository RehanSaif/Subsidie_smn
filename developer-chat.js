/**
 * ============================================================================
 * ISDE DEVELOPER CHAT - AI ASSISTANT
 * ============================================================================
 *
 * Standalone tool voor developers om vragen te stellen over de codebase.
 * Gebruikt Mistral AI met embedded codebase kennis.
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let conversationHistory = [];
let isProcessing = false;

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SYSTEM_PROMPT = `Je bent een expert developer assistant voor de ISDE Chrome Extension codebase.

## PROJECT OVERZICHT
${CODEBASE_KNOWLEDGE.structure.description}

## CORE FILES
${CODEBASE_KNOWLEDGE.structure.coreFiles.map(f => `- ${f.file}: ${f.purpose}`).join('\n')}

## ARCHITECTUUR
${CODEBASE_KNOWLEDGE.architecture.dataFlow}

${CODEBASE_KNOWLEDGE.architecture.selectorRegistry}

${CODEBASE_KNOWLEDGE.architecture.configuration}

## FILE LOCATIONS (met line numbers)
${Object.entries(CODEBASE_KNOWLEDGE.fileLocations).map(([file, info]) =>
  `${file}: ${info.description}\n${Object.entries(info.sections).map(([name, lines]) =>
    `  - ${name}: lines ${lines}`
  ).join('\n')}`
).join('\n\n')}

## JE TAAK
Beantwoord developer vragen over:
- Code vinden en begrijpen
- Features toevoegen
- Bugs fixen
- Selectors updaten
- Sanitization toevoegen

## ANTWOORD FORMAT
Geef altijd:
1. **Directe antwoord** op de vraag
2. **File + line number** references (bijv. "config.js:193-201")
3. **Code snippets** waar relevant (gebruik \`\`\`javascript blocks)
4. **Stap-voor-stap** instructies indien van toepassing

## VOORBEELDEN
Als developer vraagt "Hoe voeg ik een veld toe?":
- Geef concrete stappen (1. popup.html, 2. popup.js, etc.)
- Toon code voorbeelden
- Reference line numbers

Als developer vraagt "Waar wordt X gedaan?":
- Geef file + line number
- Leg kort uit wat daar gebeurt
- Suggest gerelateerde code

Wees **praktisch**, **precies**, en **beknopt**. Developers willen snel antwoorden.`;

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
 * Bouw relevante context op basis van vraag.
 * @param {string} question - User vraag
 * @returns {string} Context string
 */
function buildContext(question) {
  const q = question.toLowerCase();

  // Detect topic en return relevante recipe
  if (q.includes('veld') && (q.includes('toevoeg') || q.includes('nieuw'))) {
    return `RELEVANTE RECIPE:\n${JSON.stringify(CODEBASE_KNOWLEDGE.recipes.addFormField, null, 2)}`;
  }

  if (q.includes('selector') && (q.includes('update') || q.includes('wijzig'))) {
    return `RELEVANTE RECIPE:\n${JSON.stringify(CODEBASE_KNOWLEDGE.recipes.updateSelector, null, 2)}`;
  }

  if (q.includes('sanitization') || q.includes('validatie')) {
    return `RELEVANTE RECIPE:\n${JSON.stringify(CODEBASE_KNOWLEDGE.recipes.addSanitization, null, 2)}`;
  }

  if (q.includes('loop') && q.includes('detect')) {
    return `RELEVANTE RECIPE:\n${JSON.stringify(CODEBASE_KNOWLEDGE.recipes.fixLoopDetection, null, 2)}`;
  }

  if (q.includes('statistiek') || q.includes('tracking')) {
    return `RELEVANTE RECIPE:\n${JSON.stringify(CODEBASE_KNOWLEDGE.recipes.addStatistic, null, 2)}`;
  }

  // Default: return troubleshooting guide indien relevant
  for (const [issue, info] of Object.entries(CODEBASE_KNOWLEDGE.troubleshooting)) {
    if (q.includes(issue.toLowerCase().split(' ')[0])) {
      return `TROUBLESHOOTING:\n${JSON.stringify(info, null, 2)}`;
    }
  }

  // Als geen match, return project structure
  return `PROJECT STRUCTURE:\n${JSON.stringify(CODEBASE_KNOWLEDGE.structure, null, 2)}`;
}

/**
 * Stuur vraag naar Mistral AI.
 * @param {string} userQuestion - Developer vraag
 * @returns {Promise<string>} AI antwoord
 */
async function sendToMistral(userQuestion) {
  const apiKey = getMistralKey();
  const context = buildContext(userQuestion);

  // Build messages array
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: context },
    ...conversationHistory,
    { role: 'user', content: userQuestion }
  ];

  console.log('📤 Sending to Mistral AI...');
  console.log('Context:', context.substring(0, 200) + '...');

  const response = await fetch(CONFIG.getMistralUrl('chat/completions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: CONFIG.MISTRAL_MODELS.EXTRACTION, // mistral-small-latest
      messages: messages,
      max_tokens: 2000,
      temperature: 0.3 // Lower temperature for more focused, accurate answers
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Mistral API error:', errorText);
    throw new Error(`Mistral API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('📥 Response received from Mistral');

  return data.choices[0].message.content;
}

// ============================================================================
// UI FUNCTIONS
// ============================================================================

/**
 * Voeg message toe aan chat history.
 * @param {string} role - 'user' of 'assistant'
 * @param {string} content - Message text
 */
function addMessageToUI(role, content) {
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
  formattedContent = formattedContent.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code>${escapeHtml(code.trim())}</code></pre>`;
  });

  // Format inline `code`
  formattedContent = formattedContent.replace(/`([^`]+)`/g, '<code>$1</code>');

  contentDiv.innerHTML = formattedContent;

  messageDiv.appendChild(roleDiv);
  messageDiv.appendChild(contentDiv);
  chatHistory.appendChild(messageDiv);

  // Scroll to bottom
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

/**
 * Voeg error message toe.
 * @param {string} error - Error tekst
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
 * Verwerk user vraag.
 * @param {string} question - User vraag
 */
async function handleUserQuestion(question) {
  if (!question.trim()) return;
  if (isProcessing) return;

  try {
    // Add user message to UI
    addMessageToUI('user', question);

    // Add to conversation history
    conversationHistory.push({ role: 'user', content: question });

    // Show loading
    setLoading(true);

    // Get AI response
    const response = await sendToMistral(question);

    // Add assistant message to UI
    addMessageToUI('assistant', response);

    // Add to conversation history (keep last 10 messages for context)
    conversationHistory.push({ role: 'assistant', content: response });
    if (conversationHistory.length > 10) {
      conversationHistory = conversationHistory.slice(-10);
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

document.addEventListener('DOMContentLoaded', () => {
  const sendBtn = document.getElementById('sendBtn');
  const userInput = document.getElementById('userInput');

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

  console.log('✅ Developer Chat initialized');
  console.log('📚 Loaded knowledge base with', Object.keys(CODEBASE_KNOWLEDGE.recipes).length, 'recipes');
});

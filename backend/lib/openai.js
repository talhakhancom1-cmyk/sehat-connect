/**
 * OpenAI integration for the Symptom Checker feature.
 * The API key is read from process.env.OPENAI_API_KEY and NEVER exposed to the frontend.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1';

const SYSTEM_PROMPT = `You are a healthcare triage assistant for the Sehat Connect platform. Your role is STRICTLY LIMITED to:

1. Asking clarifying questions about symptoms (duration, severity, associated symptoms) — maximum 2-3 exchanges.
2. Providing one of three urgency levels:
   - "Routine" — book an appointment when convenient
   - "Soon" — book within 24-48 hours
   - "Urgent" — seek immediate medical care
3. Suggesting which medical specialty the patient should consult (e.g., Cardiology, Dermatology, General Medicine, Neurology, Orthopedics, Pediatrics, Psychiatry, Gynecology, ENT, Gastroenterology).

YOU MUST NOT:
- Provide a diagnosis or name a specific medical condition with certainty
- Suggest specific medications, dosages, or treatments
- Recommend home remedies
- Provide definitive medical advice
- Claim certainty about any condition

Always include in every response: "This is not a medical diagnosis. Please consult a doctor for proper evaluation."

If the patient describes an emergency (difficulty breathing, chest pain, severe bleeding, loss of consciousness, suicidal thoughts), immediately respond with urgency level "Urgent" and tell them to seek immediate emergency care.

Keep responses concise and focused on triage, not diagnosis.

When you have enough information to provide a triage assessment, format your final response as JSON:
{
  "response": "Your triage message to the patient (with disclaimer)",
  "urgency": "routine" | "soon" | "urgent",
  "specialty": "Suggested specialty or null",
  "is_final": true
}

For follow-up questions (when you need more info), use:
{
  "response": "Your follow-up question (with disclaimer)",
  "urgency": null,
  "specialty": null,
  "is_final": false
}`;

/**
 * Check if the input is flagged by OpenAI moderation.
 * Returns { flagged: boolean, categories: object }
 */
async function moderateContent(input) {
  if (!OPENAI_API_KEY) return { flagged: false, categories: {} };

  try {
    const resp = await fetch(`${OPENAI_API_URL}/moderations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input }),
    });

    if (!resp.ok) {
      console.warn('[openai] Moderation API error:', resp.status);
      return { flagged: false, categories: {} };
    }

    const data = await resp.json();
    const result = data.results?.[0];
    return {
      flagged: result?.flagged || false,
      categories: result?.categories || {},
    };
  } catch (err) {
    console.warn('[openai] Moderation request failed:', err.message);
    return { flagged: false, categories: {} };
  }
}

/**
 * Send a chat completion request to OpenAI.
 * Returns { response, urgency, specialty, is_final }
 */
async function chatCompletion(messages) {
  if (!OPENAI_API_KEY) {
    return {
      response: 'The symptom checker is not available at this time. Please consult a doctor directly.',
      urgency: null,
      specialty: null,
      is_final: true,
      error: 'OPENAI_API_KEY not configured',
    };
  }

  try {
    const chatMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map(m => ({
        role: m.role === 'patient' ? 'user' : 'assistant',
        content: m.content,
      })),
    ];

    const resp = await fetch(`${OPENAI_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: chatMessages,
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error('[openai] Chat API error:', resp.status, errBody);
      let userMessage = 'I apologize, but I encountered an error. Please try again or consult a doctor directly.';
      if (resp.status === 401) {
        userMessage = 'The symptom checker is not properly configured. Please contact support.';
      } else if (resp.status === 429) {
        userMessage = 'The symptom checker is temporarily unavailable due to high demand or API limits. Please try again later or consult a doctor directly.';
      } else if (resp.status === 500 || resp.status === 503) {
        userMessage = 'The AI service is temporarily unavailable. Please try again in a few minutes or consult a doctor directly.';
      }
      return {
        response: `${userMessage} This is not a medical diagnosis. Please consult a doctor for proper evaluation.`,
        urgency: null,
        specialty: null,
        is_final: true,
        error: `OpenAI API error: ${resp.status}`,
      };
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;

    // Parse JSON response
    try {
      const parsed = JSON.parse(content);
      return {
        response: parsed.response || content,
        urgency: parsed.urgency || null,
        specialty: parsed.specialty || null,
        is_final: parsed.is_final || false,
      };
    } catch {
      // If not JSON, return as plain text
      return {
        response: content || 'No response from AI.',
        urgency: null,
        specialty: null,
        is_final: false,
      };
    }
  } catch (err) {
    console.error('[openai] Chat request failed:', err.message);
    return {
      response: 'I apologize, but I encountered a network error. Please try again or consult a doctor directly. This is not a medical diagnosis. Please consult a doctor for proper evaluation.',
      urgency: null,
      specialty: null,
      is_final: true,
      error: err.message,
    };
  }
}

module.exports = { moderateContent, chatCompletion, SYSTEM_PROMPT };

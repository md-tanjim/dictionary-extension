// popup.js

/************* CONFIG – EDIT THESE *************/
const OPENAI_API_KEY = "YOUR-API-KEY";   // <- put your key
const GEMINI_API_KEY = "YOUR-API-KEY";   // <- put your key
const DEFAULT_MODEL = "openai"; // "openai" or "gemini"
/***********************************************/

const inputEl = document.getElementById("inputText");
const modelSelectEl = document.getElementById("modelSelect");

const lookupBtn = document.getElementById("lookupBtn");
const speakBtn = document.getElementById("speakBtn");

const wordDisplayEl = document.getElementById("wordDisplay");
const ipaEl = document.getElementById("ipa");
const posTagEl = document.getElementById("posTag");
const definitionEl = document.getElementById("definition");
const banglaEl = document.getElementById("bangla");
const sentencesEl = document.getElementById("sentences");
const synonymsEl = document.getElementById("synonyms");
const antonymsEl = document.getElementById("antonyms");
const errorEl = document.getElementById("error");

// Load selection + model on popup open
document.addEventListener("DOMContentLoaded", async () => {
  const { lastSelection, preferredModel, autoLookup } =
    await chrome.storage.local.get(["lastSelection", "preferredModel", "autoLookup"]);

  if (lastSelection) {
    inputEl.value = lastSelection;
    wordDisplayEl.textContent = lastSelection;
  }

  if (preferredModel) {
    modelSelectEl.value = preferredModel;
  } else {
    modelSelectEl.value = DEFAULT_MODEL;
  }

  // Save model when user switches
  modelSelectEl.addEventListener("change", async () => {
    await chrome.storage.local.set({ preferredModel: modelSelectEl.value });
  });

  // Auto lookup when opened via shortcut
  if (autoLookup && inputEl.value.trim()) {
    await chrome.storage.local.set({ autoLookup: false });
    doLookup();
  }
});

lookupBtn.addEventListener("click", () => {
  doLookup();
});

speakBtn.addEventListener("click", () => {
  const speechText = collectTextForSpeech();
  if (!speechText) {
    errorEl.textContent = "Lookup first, then play audio.";
    return;
  }
  speakText(speechText);
});

function clearOutput() {
  definitionEl.textContent = "";
  banglaEl.textContent = "";
  sentencesEl.innerHTML = "";
  synonymsEl.textContent = "";
  antonymsEl.textContent = "";
  errorEl.textContent = "";
}

async function doLookup() {
  clearOutput();

  const text = inputEl.value.trim();
  if (!text) {
    errorEl.textContent = "Please enter or select a word/phrase.";
    return;
  }

  wordDisplayEl.textContent = text;

  const modelType = modelSelectEl.value;

  try {
    let data;
    if (modelType === "openai") {
      if (!OPENAI_API_KEY || OPENAI_API_KEY.startsWith("YOUR_")) {
        errorEl.textContent = "Set your OpenAI API key in popup.js.";
        return;
      }
      data = await callOpenAI(text);
    } else {
      if (!GEMINI_API_KEY || GEMINI_API_KEY.startsWith("YOUR_")) {
        errorEl.textContent = "Set your Gemini API key in popup.js.";
        return;
      }
      data = await callGemini(text);
    }
    renderResult(data);
  } catch (e) {
    console.error(e);
    errorEl.textContent = "Error: " + (e.message || "Something went wrong.");
  }
}

/*************** PROMPT + API CALLS *****************/

function buildPrompt(wordOrPhrase) {
  return `
You are a bilingual English → Bangla dictionary assistant.

When I give you a word or phrase, reply ONLY with valid JSON in this structure:

{
  "word": "The original word or phrase.",
  "ipa": "/IPA transcription like this/",
  "partOfSpeech": "part of speech in English, like noun, verb, adjective, adverb.",
  "definition": "English definition, clear and concise.",
  "bangla": "Bangla translation in Bangla script.",
  "sentencesIntermediate": [
    "Intermediate level sentence 1.",
    "Intermediate level sentence 2."
  ],
  "sentenceAdvanced": "One advanced-level sentence.",
  "synonyms": ["exactly three", "English", "synonyms"],
  "antonyms": ["exactly three", "English", "antonyms"]
}

Rules:
- The definition must be in English.
- The "bangla" field must be in Bangla (Bengali) script.
- "sentencesIntermediate" = exactly 2 sentences.
- "sentenceAdvanced" = exactly 1 sentence.
- "synonyms" = array of exactly 3 single-word or short-phrase synonyms.
- "antonyms" = array of exactly 3 single-word or short-phrase antonyms.
- Do not explain anything.
- Do not add markdown.
- Do not add any text outside the JSON.

Now process this word or phrase: "${wordOrPhrase}"
`.trim();
}

async function callOpenAI(wordOrPhrase) {
  const prompt = buildPrompt(wordOrPhrase);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + OPENAI_API_KEY
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "You are a precise dictionary and language tutor." },
        { role: "user", content: prompt }
      ],
      temperature: 0.4
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error("OpenAI API error: " + text);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  return safeParseJSON(content);
}

async function callGemini(wordOrPhrase) {
  const prompt = buildPrompt(wordOrPhrase);

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" +
    encodeURIComponent(GEMINI_API_KEY);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error("Gemini API error: " + text);
  }

  const data = await response.json();
  const text =
    data.candidates?.[0]?.content?.parts?.[0]?.text ||
    data.candidates?.[0]?.output_text ||
    "";

  return safeParseJSON(text);
}

function safeParseJSON(raw) {
  let cleaned = raw.trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "");
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn("Raw model output:", raw);
    throw new Error("Could not parse JSON from model.");
  }
}

/***************** RENDER + AUDIO ******************/

function renderResult(data) {
  if (!data) return;

  // word, ipa, pos
  wordDisplayEl.textContent = data.word || inputEl.value.trim();
  ipaEl.textContent = data.ipa || "";
  const pos = (data.partOfSpeech || "").toString();
  posTagEl.textContent = pos ? pos.toUpperCase() : "";

  // definition & bangla
  definitionEl.textContent = data.definition || "";
  banglaEl.textContent = data.bangla || "";

  // sentences
  sentencesEl.innerHTML = "";
  (data.sentencesIntermediate || []).forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s;
    sentencesEl.appendChild(li);
  });

  if (data.sentenceAdvanced) {
    const li = document.createElement("li");
    li.textContent = data.sentenceAdvanced;
    sentencesEl.appendChild(li);
  }

  // synonyms & antonyms: join with " | "
  if (Array.isArray(data.synonyms)) {
    synonymsEl.textContent = data.synonyms.join(" | ");
  }
  if (Array.isArray(data.antonyms)) {
    antonymsEl.textContent = data.antonyms.join(" | ");
  }
}

function collectTextForSpeech() {
  const word = wordDisplayEl.textContent.trim();
  const items = sentencesEl.querySelectorAll("li");
  if (!word || !items.length) return null;

  let text = word + ". ";
  items.forEach((li, i) => {
    text += (i + 1) + ". " + li.textContent + " ";
  });
  return text.trim();
}

function speakText(text) {
  if (!("speechSynthesis" in window)) {
    errorEl.textContent = "Speech synthesis not supported in this browser.";
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  window.speechSynthesis.speak(utterance);
}


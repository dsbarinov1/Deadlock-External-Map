import { GoogleGenAI, Type } from "@google/genai";

export interface TacticalAlert {
  voice: string; // Very short string for TTS (e.g. "Gank Top")
  text: string;  // Slightly longer text for display
}

export const analyzeMapSnapshot = async (base64Image: string): Promise<TacticalAlert | null> => {
  // 1. Check for API Key explicitly before initializing the SDK.
  // This prevents the "API key must be set" crash during app startup.
  if (!process.env.API_KEY) {
    console.warn("API Key is missing in process.env");
    return { voice: "System Error", text: "API Key Missing" };
  }

  // Remove data URL prefix if present
  const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

  try {
    // 2. Initialize the SDK *only* when the function is called and key is present.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: 'image/png'
            }
          },
          {
            text: `You are a tactical computer for the MOBA game Deadlock.
            Analyze this minimap screenshot.
            
            OBJECT RECOGNITION RULES:
            1. **IGNORE CREEPS/TROOPERS**: Small colored dots, tiny triangles, or small diamonds are generic units. DO NOT REPORT THEM.
            2. **IDENTIFY HEROES**: Heroes appear as LARGER CIRCLES with distinct character FACES/PORTRAITS inside them.
            3. **IGNORE PLAYER**: The yellow arrow/cone is the player. Ignore it unless surrounded.
            
            TACTICAL ANALYSIS:
            - Look for CLUSTERS of Enemy Hero Icons (Red Portraits).
            - Look for Enemy Hero Icons deep in a lane (pushing).
            - If you only see small dots (creeps), the status is CLEAR.
            
            OUTPUT FORMAT:
            Return a JSON object with "voice" and "text" fields.
            If nothing dangerous is happening (only creeps visible), return empty strings.`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            voice: {
              type: Type.STRING,
              description: "Spoken alert (max 3-5 words). E.g. 'Three enemies top' or 'Mid lane danger'"
            },
            text: {
              type: Type.STRING,
              description: "Display text (max 8 words)."
            }
          }
        }
      }
    });

    const rawText = response.text || "";
    if (!rawText) return null;

    try {
      const alert = JSON.parse(rawText) as TacticalAlert;
      // If strings are empty, return null
      if (!alert.voice && !alert.text) return null;
      return alert;
    } catch (e) {
      console.warn("Failed to parse JSON from AI", rawText);
      return null;
    }

  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    return null;
  }
};
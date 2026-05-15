import { NextResponse } from "next/server";
import { Message, ChatRequestBody } from "../../../types/chat";
import { createClient } from "@supabase/supabase-js";

// Inicialización de Supabase
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { messages, businessContext }: ChatRequestBody = await req.json();
    const lastUserMessage = messages[messages.length - 1]?.content || "";
    const businessName = businessContext.split(".")[0];

    // --- 1. UNIR TODO EL HISTORIAL PARA NO PERDER CONTEXTO ---
    const allUserText = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" | ");

    // --- 2. EXTRAER TELÉFONO DEL HISTORIAL COMPLETO ---
    const phoneRegex = /(?:\+?591)?\s?[67]\d{7}/g;
    const foundPhone = allUserText.match(phoneRegex);
    const phoneNumber = foundPhone ? foundPhone[foundPhone.length - 1].replace(/\s/g, "") : null;

    const bookingKeywords = [
      "agendar", "cita", "visita", "mañana", "lunes", "martes", 
      "miércoles", "jueves", "viernes", "sábado", "probar", 
      "iré", "pasaré", "paso", "am", "pm", "las 4", "las 3", "hora"
    ];
    const wantsToBook = bookingKeywords.some((key) => allUserText.toLowerCase().includes(key));

    // --- 3. LÓGICA DE GUARDADO: SOLO GUARDAR SI HAY NÚMERO ---
    // Si no hay número, no guardamos "basura" en la base de datos
    if (phoneNumber) {
      let finalDate = null;

      if (wantsToBook) {
        const dateExtractor = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `Hoy es viernes 15 de mayo de 2026. 
                Analiza todo el texto del usuario y extrae la fecha y hora de la cita. 
                Si no hay hora clara, responde "NO_DATE". 
                Si hay, responde ÚNICAMENTE en formato YYYY-MM-DD HH:mm.`
              },
              { role: "user", content: allUserText }
            ]
          })
        });

        const dateData = await dateExtractor.json();
        const extracted = dateData.choices[0]?.message?.content?.trim();
        if (extracted !== "NO_DATE") finalDate = extracted;
      }

      // --- 4. ACTUALIZAR O INSERTAR (Evita el doble registro) ---
      // Buscamos si este número ya está en la base de datos
      const { data: existingData } = await supabase
        .from("appointments")
        .select("id")
        .eq("whatsapp", phoneNumber);

      if (existingData && existingData.length > 0) {
        // Si existe, lo ACTUALIZAMOS (Aquí se unen Fecha y Teléfono en una sola fila)
        await supabase
          .from("appointments")
          .update({
            appointment_date: finalDate,
            appointment_details: lastUserMessage, // Para tener un historial
            status: finalDate ? "cita_confirmada" : "solo_lead",
          })
          .eq("whatsapp", phoneNumber);
      } else {
        // Si es nuevo, lo INSERTAMOS
        await supabase.from("appointments").insert([
          {
            whatsapp: phoneNumber,
            appointment_date: finalDate,
            appointment_details: lastUserMessage,
            status: finalDate ? "cita_confirmada" : "solo_lead",
            business_name: businessName,
          },
        ]);
      }
    }

    // --- 5. RESPUESTA DE LA IA PRINCIPAL (CORREGIDA) ---
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Eres el Asistente VIP de ventas de ${businessContext}.
            
            REGLAS DE ORO (LEER ATENTAMENTE):
            1. NUNCA PIDAS CÓDIGO DE PAÍS. Asume que el número es local y correcto automáticamente.
            2. NO PIDAS EXPLICACIONES sobre el número. Si te dan un número (ej: 79323062), acéptalo de inmediato.
            3. OBLIGATORIO: Si el usuario quiere agendar pero no ha dado su número, di: "¡Claro que sí! Para confirmar tu cita en el sistema, ¿me podrías dejar tu número de WhatsApp?"
            4. SI YA TE DIO EL NÚMERO Y LA HORA: Di "¡Perfecto! Ya agendé tu visita para [Hora]. ¡Nos vemos pronto en el gym! 💪" y despídete amablemente.
            5. HORARIOS: Está abierto toda la tarde. NUNCA rechaces horas como 4 PM, 5 PM, etc.`,
          },
          ...messages,
        ],
      }),
    });

    const data = await response.json();
    return NextResponse.json(data.choices[0].message);
    
  } catch (error) {
    console.error("Error fatal:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
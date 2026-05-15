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

   // --- 5. RESPUESTA DE LA IA PRINCIPAL (FLUJO ESTRICTO) ---
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
            content: `Eres el Asistente VIP de ventas de ${businessContext}. Tu estilo es amigable y servicial.

            DEBES SEGUIR ESTE FLUJO EXACTO DEPENDIENDO DE LA SITUACIÓN:

            SITUACIÓN A: El usuario SOLO pide información (precio, horarios).
            ACCIÓN: Da la información y haz una pregunta amigable (ej: "¿Te gustaría venir a conocer?"). ¡PROHIBIDO PEDIR WHATSAPP AÚN!

            SITUACIÓN B: El usuario dice que quiere ir (ej: "sí, quiero ir", "mañana a las 4pm"), PERO NO HA DADO SU NÚMERO.
            ACCIÓN: Celebra la decisión y PIDE EL WHATSAPP COMO REQUISITO. 
            EJEMPLO: "¡Genial! El horario de las 4 PM está perfecto. Para poder anotar tu visita en el sistema y esperarte, ¿me podrías dejar tu número de WhatsApp?"
            REGLA DE ORO: ¡NO CONFIRMES LA CITA SI NO TIENES EL NÚMERO!

            SITUACIÓN C: El usuario YA TE DIO EL NÚMERO (ej: "mi cel es 71234567") y YA HAY UNA HORA ACORDADA.
            ACCIÓN: AHORA SÍ, CONFIRMA LA CITA.
            EJEMPLO: "¡Perfecto! Ya anoté tu visita para mañana a las 4 PM. ¡Nos vemos en el gym! 💪"

            SITUACIÓN D: El usuario te da el número, pero falta la hora.
            ACCIÓN: Agradécele el número y pregúntale a qué hora le gustaría ir.

            REGLAS GENERALES:
            - NUNCA PIDAS CÓDIGO DE PAÍS. Asume que el número es local.
            - HORARIOS: Abierto de 6 AM a 10 PM. La tarde entera está abierta.`,
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
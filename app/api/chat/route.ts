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

    // --- 1. UNIR HISTORIAL ---
    const allUserText = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" | ");

    // --- 2. EXTRAER TELÉFONO ---
    const phoneRegex = /(?:\+?591)?\s?[67]\d{7}/g;
    const foundPhone = allUserText.match(phoneRegex);
    const phoneNumber = foundPhone ? foundPhone[foundPhone.length - 1].replace(/\s/g, "") : null;

    const bookingKeywords = [
      "agendar", "cita", "visita", "mañana", "lunes", "martes", 
      "miércoles", "jueves", "viernes", "sábado", "probar", 
      "iré", "pasaré", "paso", "am", "pm", "las 4", "las 3", "hora"
    ];
    const wantsToBook = bookingKeywords.some((key) => allUserText.toLowerCase().includes(key));

    // --- 3. LÓGICA DE GUARDADO SÚPER ESTRICTA ---
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
                Extrae la FECHA y HORA de la cita del texto del usuario.
                Responde EXCLUSIVAMENTE con el formato: YYYY-MM-DD HH:mm:00
                Si no hay hora clara, responde: NO_DATE`
              },
              { role: "user", content: allUserText }
            ]
          })
        });

        const dateData = await dateExtractor.json();
        const extracted = dateData.choices[0]?.message?.content?.trim() || "";
        
        // 🚀 FILTRO DE FUERZA BRUTA: Extrae SOLO los números de la fecha, ignorando si la IA dice palabras extra
        const exactDateMatch = extracted.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
        if (exactDateMatch) {
          finalDate = exactDateMatch[0]; // Esto asegura que Supabase reciba un formato perfecto
        }
      }

      // --- 4. GUARDAR EN SUPABASE (A PRUEBA DE DUPLICADOS) ---
      // Usamos .limit(1) para evitar el error fatal si hay datos viejos repetidos
      const { data: existingRecords, error: fetchError } = await supabase
        .from("appointments")
        .select("*")
        .eq("whatsapp", phoneNumber)
        .limit(1);

      if (fetchError) console.error("Error buscando registro:", fetchError);

      const existingRecord = existingRecords?.[0];
      const dateToSave = finalDate ? finalDate : (existingRecord?.appointment_date || null);
      const statusToSave = dateToSave ? "cita_confirmada" : "solo_lead";

      if (existingRecord) {
        // ACTUALIZAR
        const { error: updateError } = await supabase
          .from("appointments")
          .update({
            appointment_date: dateToSave,
            appointment_details: lastUserMessage,
            status: statusToSave,
          })
          .eq("id", existingRecord.id); // Actualizamos por ID para mayor seguridad
          
        if (updateError) console.error("Error al actualizar:", updateError);
        else console.log("✅ Fila actualizada correctamente");

      } else {
        // INSERTAR
        const { error: insertError } = await supabase.from("appointments").insert([
          {
            whatsapp: phoneNumber,
            appointment_date: dateToSave,
            appointment_details: lastUserMessage,
            status: statusToSave,
            business_name: businessName,
          },
        ]);
        
        if (insertError) console.error("Error al insertar:", insertError);
        else console.log("✅ Nueva fila insertada correctamente");
      }
    }

   // --- 5. RESPUESTA DE LA IA PRINCIPAL ---
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
            ACCIÓN: Da la información y haz una pregunta amigable. ¡PROHIBIDO PEDIR WHATSAPP AÚN!

            SITUACIÓN B: El usuario dice que quiere ir, PERO NO HA DADO SU NÚMERO.
            ACCIÓN: Celebra la decisión y PIDE EL WHATSAPP COMO REQUISITO. 
            REGLA DE ORO: ¡NO CONFIRMES LA CITA SI NO TIENES EL NÚMERO!

            SITUACIÓN C: El usuario YA TE DIO EL NÚMERO y YA HAY UNA HORA ACORDADA.
            ACCIÓN: AHORA SÍ, CONFIRMA LA CITA. Ej: "¡Perfecto! Ya anoté tu visita para mañana a las 4 PM. ¡Nos vemos en el gym! 💪"

            SITUACIÓN D: El usuario te da el número, pero falta la hora.
            ACCIÓN: Agradécele el número y pregúntale a qué hora le gustaría ir.

            REGLAS GENERALES:
            - NUNCA PIDAS CÓDIGO DE PAÍS. Asume local.
            - Abierto de 6 AM a 10 PM. La tarde entera está abierta.`,
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
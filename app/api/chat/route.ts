import { NextResponse } from "next/server";
import { Message, ChatRequestBody } from "../../../types/chat";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { messages, businessContext }: ChatRequestBody = await req.json();
    const lastUserMessage = messages[messages.length - 1]?.content || "";
    const businessName = businessContext.split(".")[0];

    // --- 1. UNIR HISTORIAL PARA EXTRAER DATOS ---
    const allUserText = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" | ");

    // --- 2. EXTRACCIÓN DE TELÉFONO (Busca en toda la charla) ---
    const phoneRegex = /(?:\+?591)?\s?[67]\d{7}/g;
    const foundPhone = allUserText.match(phoneRegex);
    const phoneNumber = foundPhone ? foundPhone[foundPhone.length - 1].replace(/\s/g, "") : null;

    // --- 3. EXTRACCIÓN DE FECHA (AHORA ES OBLIGATORIA SI HAY MENSAJES) ---
    let finalDateStr = null;
    
    // Simplificamos el texto para la IA: solo los últimos 3 mensajes para no marearla
    const recentHistory = messages.slice(-3).map(m => `${m.role}: ${m.content}`).join("\n");

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
            content: `Hoy es viernes 2026-05-15. Tu única tarea es extraer FECHA y HORA de visita.
            Responde EXCLUSIVAMENTE con el formato: YYYY-MM-DD HH:mm:00
            Si el usuario no dice una hora clara (ej. solo dice "hola" o "precio"), responde: NO_DATE`
          },
          { role: "user", content: recentHistory }
        ]
      })
    });

    const dateData = await dateExtractor.json();
    const extracted = dateData.choices[0]?.message?.content?.trim() || "";
    
    // Usamos Regex para capturar solo la fecha y limpiar basura
    const dateMatch = extracted.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    if (dateMatch) {
      finalDateStr = dateMatch[0];
      console.log("📅 FECHA DETECTADA POR IA:", finalDateStr);
    } else {
      console.log("ℹ️ No se detectó fecha en este mensaje.");
    }

    // --- 4. GUARDADO EN SUPABASE (HORA FIJA COCHABAMBA) ---
    if (phoneNumber) {
      const { data: existingRecords } = await supabase
        .from("appointments")
        .select("*")
        .eq("whatsapp", phoneNumber)
        .limit(1);

      const record = existingRecords?.[0];
      
      // Enviamos el string directo "YYYY-MM-DD HH:mm:00". 
      // Supabase (Postgres) lo aceptará tal cual sin moverle las horas.
      let dateToSave = finalDateStr || (record?.appointment_date || null);
      const statusToSave = dateToSave ? "cita_confirmada" : "solo_lead";

      if (record) {
        const { error: upErr } = await supabase
          .from("appointments")
          .update({
            appointment_date: dateToSave, 
            appointment_details: lastUserMessage,
            status: statusToSave,
          })
          .eq("id", record.id);
        
        if (!upErr) console.log("✅ SINCRONIZADO EN BD (Hora Local):", dateToSave);
      } else {
        const { error: inErr } = await supabase.from("appointments").insert([
          {
            whatsapp: phoneNumber,
            appointment_date: dateToSave,
            appointment_details: lastUserMessage,
            status: statusToSave,
            business_name: businessName,
          },
        ]);
        
        if (!inErr) console.log("✅ REGISTRADO EN BD (Hora Local):", dateToSave);
      }
    }

    // --- 5. RESPUESTA AL USUARIO (FLUJO DE AGENDADO ESTRICTO) ---
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
            content: `Eres el Asistente VIP de Iron Life Gym. Tu misión es agendar visitas COMPLETAS.

            REGLA DE ORO: NO CONFIRMES LA CITA SI FALTA EL WHATSAPP O LA HORA.

            PASOS PARA AGENDAR:
            1. Si el usuario dice que quiere ir, pero NO ha dado su hora ni su WhatsApp:
               Respuesta: "¡Excelente decisión! Para agendarte, ¿qué número de WhatsApp tienes y a qué hora te gustaría pasar (6am - 10pm)?"

            2. Si ya te dio el WhatsApp pero FALTA LA HORA:
               Respuesta: "¡Recibido! Ya tengo tu WhatsApp. Ahora solo confírmame: ¿a qué hora te esperamos mañana?" (NO digas que ya está anotado hasta tener la hora).

            3. Si ya te dio la hora pero FALTA EL WHATSAPP:
               Respuesta: "¡Perfecto a esa hora! Para separar tu espacio y avisar al coach, ¿me dejas tu número de WhatsApp?"

            4. CUANDO TENGAS AMBOS (Número + Hora):
               Respuesta: "¡Todo listo! 📝 He agendado tu visita para mañana a las [Hora]. ¡Nos vemos en el gym! 💪"

            DATOS DEL GYM: Mensualidad 250 Bs, coach incluido. Abierto de 6 AM a 10 PM. Las 4 PM es VÁLIDO.`,
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
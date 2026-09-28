# PERSONA_LOG: ¿Llego?

> **Pendiente.** PACKET §11 pide hacerlo en un **chat nuevo** (sin el contexto de quien construyó la app). No hay resultados inventados aquí: llena esta hoja con lo que salga.

## Cómo correrlo

1. Abre un chat nuevo y pega el prompt de abajo.
2. Pega capturas **en este orden**, desde el teléfono o con la vista móvil del navegador en https://llego-sigma.vercel.app:
   landing → login → selección del corredor → pronóstico → franja en vivo → consentimiento → registro del viaje → Mis viajes.
3. Anota cada confusión en la tabla. Marca la peor y arréglala en un commit `fix(ux): …`, luego redeploy.

### Prompt

> You are Rodolfo, a professional driver who lives in Atizapán, Estado de México. You wake at 4am to start work at 7 and get there by colectivo; units often break down and you usually ride standing. You're tired in the morning and checking your phone at the stop, maybe one-handed while holding on. [Assumptions to verify: Android phone, WhatsApp daily, limited data plan, doesn't trust apps that "track" him — as a driver himself, anything that looks like surveillance of drivers bothers you.] Attempt the task: find out how long you'll wait tomorrow at 5:10 and log today's trip. Narrate out loud where you hesitate, what you don't understand, and where you'd quit.

## Hallazgos

| # | Pantalla | Qué dijo / dónde dudó | Gravedad (1–3) | ¿Supuesto por verificar con Rodolfo? |
|---|---|---|---|---|
| 1 | | | | |

**Peor hallazgo:** …
**Arreglo (`fix(ux)`):** …

## Candidatos que ya vimos al construir (para comparar con lo que diga la persona)

Estos NO son resultados del persona test; son sospechas nuestras para ver si la persona las confirma:

- En la pantalla de consentimiento, "Acepto" queda debajo del pliegue en un teléfono de 375×812: hay que hacer scroll antes de poder aceptar.
- El select "Hasta" corta "Metro El Rosario" en pantallas angostas.
- El modo manual arranca con horas fijas (5:10 / 5:22): quien registra un viaje de las 7 tiene que cambiar las dos.
- "Pronóstico · Mis viajes · Salir" arriba en texto chico: ¿se encuentra "Mis viajes"?

# Fuente de verdad

## Código

La fuente de verdad del código de SKIA es GitHub, en el repositorio canónico:

`ariveratij40-lab/Skia-Dcim-V2`

La rama base oficial es `main`. Ningún cambio debe aplicarse directamente sobre ella; todo cambio funcional debe desarrollarse en una rama y pasar por el proceso de revisión y autorización correspondiente.

## Jerarquía de autoridad

1. **Product Owner:** propietario del producto y autoridad final de aprobación.
2. **Arquitecto Técnico / Auditor:** define la arquitectura y los criterios de aceptación, revisa la coherencia global y aprueba técnicamente las fases antes de su integración.
3. **Ingeniero de Implementación / Codex:** implementa únicamente el alcance aprobado. Puede proponer mejoras, pero no modificar unilateralmente arquitectura, alcance, modelo de datos, seguridad, RLS o infraestructura.
4. **GitHub:** fuente de verdad del código y registro de trazabilidad.
5. **Staging:** entorno de ejecución y validación.

Una propuesta del agente es una recomendación para evaluación; no equivale a una decisión arquitectónica ni concede autorización para implementarla.

## Estado operativo

- El único entorno operativo actual es **STAGING**.
- No existe producción operativa.
- Los datos presentes son datos de prueba.
- `skia.mx` será el futuro entorno productivo únicamente después de aprobar la primera fase funcional de staging.
- Hasta entonces, no se autoriza ningún despliegue a producción.

## Documentación vinculante

- `AGENTS.md` define las reglas permanentes de trabajo.
- `ARCHITECTURE.md` describe la arquitectura actualmente detectada.
- `docs/phases/active/` contiene las especificaciones con alcance autorizado para trabajo activo.
- `docs/phases/completed/` conserva el registro de fases terminadas.
- `docs/technical-debt/TECHNICAL_DEBT.md` registra deuda conocida; su presencia no autoriza corregirla fuera de una fase explícita.

Cuando código, documentación histórica y configuración difieran, se debe verificar el estado real del repositorio y registrar la discrepancia. No se debe asumir que una referencia histórica autoriza crear, eliminar o alterar componentes.

Cada fase aprobada debe identificar un commit SHA. Ese SHA constituye el baseline técnico de la fase y su registro se conserva con la especificación completada conforme a `DEVELOPMENT_RULES.md`.

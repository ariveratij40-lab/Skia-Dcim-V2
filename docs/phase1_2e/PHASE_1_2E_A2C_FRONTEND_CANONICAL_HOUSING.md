# Phase 1.2E A2C — Frontend canonical housing

The asset wizards now consume the canonical housing authority introduced by migration 034 and the A2B write paths. Placement is no longer treated as a synonym for housing.

- Rack creation selects an MDF/IDF satellite and sends `mdf_idf_id`.
- Patch panels, switches, and PDUs select a rack satellite and send `housing_rack_id`.
- UPS creation explicitly selects `RACK_MOUNTED` or `ROOM_MOUNTED`; the payload contains exactly the compatible rack or placement identity.
- Branch and mode changes clear incompatible selections. Names and location labels remain presentation metadata, never identity.
- Existing assets cannot be relocated from these editors; the UI identifies relocation as a dedicated future flow.

Creation is pessimistic: the wizard awaits a successful HTTP response before updating the list or closing. A2B error codes remain visible alongside controlled Spanish messages. Migration 034 is unchanged and no migration 035 is introduced.

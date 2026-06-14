# UI Build Spec

**Source:** https://www.loom.com/share/dd80aef3221144488830959f84f46e54
**Model:** kimi/kimi-k2.6

## Summary

Zapier workflow editor connecting a Gravity Forms WordPress submission to Bloomerang CRM. The narrator wants to replace the flaky Gravity Forms trigger with a webhook and standardize the downstream Bloomerang steps (Split PKU, Find Constituent, Create Interaction, Update Address) into a reusable subzap used across multiple forms.

## Screens

### Zap Editor - Mailing List Workflow (`s1`)  00:00–00:10

Main automation canvas showing the full 5-step workflow and the expired Gravity Forms connection error.

**Narration:** The Gravity Forms to Zapier connection keeps breaking and needs to be replaced with a webhook trigger.

| Element | Type | Location | State | Behavior |
|---|---|---|---|---|
| 1. Form Data - Gravity Forms | card | main | active | Trigger step; currently in error state requiring reconnection. |
| 2. Split PKU Connection - Formatter by Zapier | card | main | default | Transforms the PKU relationship value into two separate IDs. |
| 3. Find Constituent - Bloomerang | card | main | default | Looks up or creates a Bloomerang constituent. |
| 4. Create Interaction - Bloomerang | card | main | default | Creates an interaction record in Bloomerang. |
| 5. Update Constituent - Add Address - Bloomerang | card | main | default | Fallback step to ensure the constituent address is written. |
| Status: Cannot publish Zap - Please reconnect this account | other | sidebar | error | Blocking alert that prevents publishing until the Gravity Forms account is reconnected. |

### Gravity Forms Admin - Relationship to PKU Values (`s2`)  00:10–00:25

WordPress Gravity Forms field editor showing the numeric IDs passed for the PKU relationship dropdown.

**Narration:** The form values being passed include two different PKU relationship IDs—one for the constituent record and one for the interaction record.

| Element | Type | Location | State | Behavior |
|---|---|---|---|---|
| Relationship to PKU (Required) | dropdown | main | active | Form field with predefined choices. |
| Choices: Label / Value pairs | table | main | default | Shows hidden values sent to Zapier; e.g., 'I have PKU' maps to 19480.981853185 (constituent ID), 'My child has PKU' maps to 19490.665277485 (interaction ID), etc. |

### Zapier Step Config - Find Constituent (`s3`)  00:25–01:15

Configuration panel for the Bloomerang Find Constituent step showing field mappings and upsert behavior.

**Narration:** This step upserts a constituent if they don't already exist; the data structure is nearly identical across all Zaps.

| Element | Type | Location | State | Behavior |
|---|---|---|---|---|
| Create Bloomerang Constituent if it doesn't exist yet? | toggle | main | active | When enabled, performs an upsert (creates if not found). |
| First Name | input | main | default | Mapped from Gravity Forms submission data. |
| Last Name | input | main | default | Mapped from Gravity Forms submission data. |
| Email | input | main | default | Mapped from Gravity Forms submission data. |
| Primary Address Street / City / State / ZIP | input | main | default | Mapped from Gravity Forms address fields. |

### Zapier Step Config - Create Interaction (`s4`)  01:15–02:40

Configuration panel for the Bloomerang Create Interaction step, highlighting required address fields and fallback logic.

**Narration:** Interaction creation fails if there is no address. When the form doesn't require an address, the step should fall back to the constituent's primary address already in Bloomerang.

| Element | Type | Location | State | Behavior |
|---|---|---|---|---|
| Channel | dropdown | main | default | Set to Website. |
| Initiated by Constituent? | toggle | main | active | Set to True. |
| Address / City / State / Zip | input | main | default | Required for interaction creation; mapped from form data. |
| Connection to PKU | input | main | default | Uses the second ID output from the Split PKU Formatter step. |
| Comments | input | main | default | Mapped from form comments. |

### Zapier Dashboard & Workflows List (`s5`)  02:40–03:15

Navigate and review all Zaps that need the same standardization.

**Narration:** Need to standardize the subzap across all listed Zaps except True PKU, which has a slightly different setup.

| Element | Type | Location | State | Behavior |
|---|---|---|---|---|
| Zaps | nav | sidebar | active | Navigates to the Zap workflows list. |
| Zap workflows | table | main | default | Lists all automations: True PKU, Contact Us, Mailing List, Volunteer Program, Request Support Kit, Mentor Program, Community Conference Contact Form, etc. |
| Status toggle per Zap | toggle | main | default | Enables or disables each workflow. |

## Conditional Logic

- **[01:01] Step 3 (Find Constituent) runs** → IF Bloomerang constituent does not already exist THEN Create a new Bloomerang Constituent (upsert)
  > this will upsert someone, if they're not already existing
- **[01:55] Step 4 (Create Interaction) runs** → IF Address is not provided in the form submission AND constituent record has a primary address THEN Use the constituent's primary address as the fallback for the interaction address fields
  > we can use the address fallback address from the constituent if they're already present
- **[01:52] Step 4 (Create Interaction) runs** → IF No address is available from the form or from the constituent fallback THEN Interaction creation fails
  > Interaction will fail if there is no address
- **[00:33] Mapping data into standardized subzap** → IF Incoming webhook field does not match the standardized subzap input schema THEN Map the unmatched field into a blank/placeholder field
  > if it's not, we can map it in and just like put it in a blank
- **[01:30] Form submission includes Relationship to PKU value** → IF Raw value contains two numeric IDs separated for different record types THEN Formatter splits into two outputs; first ID feeds constituent mapping, second ID feeds interaction mapping
  > that's what this split PKU does... the first one is the constituent, the second one is the interaction

## Data Model

- **FormSubmission**: first_name, last_name, email, address_street, address_city, address_state, address_zip, phone, relationship_to_pku, comments, preferred_contact_method — Originates from Gravity Forms via webhook. relationship_to_pku carries two embedded IDs.
- **Constituent**: first_name, last_name, email, primary_address_street, primary_address_city, primary_address_state, primary_address_zip, primary_email, primary_phone, pku_relationship_id — Upserted via Find Constituent step; serves as fallback address source for interactions.
- **Interaction**: date, subject, purpose, channel, initiated_by_constituent, note, address_street, address_city, address_state, address_zip, connection_to_pku_id, comments — Created after Find Constituent. Address fields are required; must fallback to constituent address if form address missing.

## Integrations

- **Gravity Forms (WordPress)**: Source form submissions; native Zapier integration is unstable and being replaced by webhook.
- **Zapier Formatter**: Splits the composite PKU relationship ID into constituent-level and interaction-level IDs.
- **Bloomerang**: Destination CRM for constituent upserts, interaction creation, and address updates.

## Build Notes

1. Replace the Gravity Forms native trigger with the Gravity Forms webhook add-on to avoid connection expiry issues. 2. Extract steps 2-4 (or 2-5) into a Zapier Subzap so the same Bloomerang logic can be reused across Contact Us, Mailing List, Volunteer Program, Request Support Kit, and Mentor Program. 3. True PKU has a different setup and should be excluded from the first pass. 4. The PKU dropdown sends numeric values where the first value corresponds to the Constituent record and the second to the Interaction record; confirm with stakeholders whether the values shown (e.g., 19480.xxx vs 19490.xxx) are stable or if they should be fetched dynamically. 5. Address handling is critical: the Interaction step requires an address. Implement a fallback chain: (a) use form address, (b) if empty use constituent primary address from Bloomerang, (c) if still empty the interaction will error. 6. The 'Update Constituent - Add Address' step exists because the initial upsert does not reliably write the address; verify if this step should run unconditionally or only when the address is missing.

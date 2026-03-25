# AutomationEdge AI Studio Dialogue Designer Knowledge Base

## 1. Core Concepts & Dialogue Fundamentals

### Dialogue Triggers
Every dialogue requires a trigger to initiate the conversation.
- **Regular Expression (Regex):** Triggers based on specific patterns (e.g., `^hello$` for an exact match).
- **NLU Intent:** Triggers based on Natural Language Understanding models (e.g., an intent like `booking_issue`).

### Feedback Mechanism
- **Configuration:** A "Capture Feedback" checkbox can be enabled during dialogue creation.
- **Functionality:** Once the dialogue logic completes, the bot automatically prompts the user for a rating (stars/numbers) and optional text comments.

---

## 2. Communication Elements

### Message Dialog Element
- **Purpose:** Displays plain text to the user.
- **Key Features:** Supports conditional display logic and can be enabled/disabled as needed.

### Card Dialog Element
- **Adaptive Card:** Highly customizable JSON-based UI for information display and input.
- **Hero Card:** Standard card for images, text, and buttons.
- **Adaptive List:** Carousel format used to display multiple records (e.g., a list of tickets).
- **JSON Integration:** Content is defined via Adaptive Card JSON. User responses can be saved to specific variables and scopes.

### Form Dialog Element
Used for structured, multi-field data collection.
- **Adaptive Card Form:** Displays all fields (choice, date, time, text) in a single interface.
- **Confirm on Submit:** A conversational, step-by-step approach. The bot asks for each field sequentially and provides a summary for the user to "Confirm" (Yes/No).

---

## 3. Data Collection & Input Handling

### Input Dialog Element
Captures user data into variables. Supports five specific types:
1. **Text:** Standard alphanumeric input. Supports Regex Validation.
2. **Choice:** Provides a list of options (comma-separated).
3. **Number:** Supports Min/Max range validation.
4. **Date:** Supports Min/Max date constraints.
5. **Time:** Standardizes input (e.g., "1 pm" to 24-hour format `13:00`).

- **NLU Entity Integration:** Allows auto-filling inputs from the initial intent (e.g., "Book Room A").
- **Retry Logic:** Custom "Retry Messages" for invalid inputs.

### File Dialog Element
- **Purpose:** Allows users to upload attachments (Excel, PDF, etc.).
- **Constraints:** Configuration includes size limits (KB) and allowed extensions.

---

## 4. Logic & State Management

### Branching Dialog Element
- **Purpose:** Routes the conversation path based on user input.
- **Condition Syntax:** Starts with `$`. 
  - *Example:* `${dialog.demo_branch.choice} == "B1"`

### Group Dialog Element
- **Purpose:** Manages multiple conditional flows within a single dialogue.
- **Channel Specificity:** Handles different UI capabilities (e.g., MS Teams vs. Web Chat).

### Set State Dialog Element
- **Purpose:** Dynamically assigns or updates variables.
- **Scopes:** `Dialog`, `Conversation`, or `User`.
- **Supported Types:** `String`, `Number`, `Dictionary`.

---

## 5. External Integrations (Actions)

### Action Dialog Element
Triggers external workflows or Python functions.
- **Wait for Response (Synchronous):** Blocks other triggers until the workflow completes.
- **No Wait (Asynchronous):** Workflow runs in the background while the user continues interacting.
- **Callback Parameters:** Requires `Additional Info` (JSON metadata) and `Chatbot Endpoint`.

---

## 6. Technical Syntax Reference

### Variable Referencing
- **General Syntax:** `${dialogue_name.variable_id}`
- **Action Parameter Syntax:** `${dialogue.dialogue_name.variable_name}`

### Adaptive Card Configuration
| Use Case | Card Type | Requirement |
| :--- | :--- | :--- |
| Single Info Card | Adaptive Card | JSON Template |
| List of records | Adaptive List | List variable + JSON Template |
| Interactive Form | Adaptive Card | Input Variable IDs + Submit Action |

### Comparison Table: Input Types
| Type | Validation Options | Standardization |
| :--- | :--- | :--- |
| Text | Regex | N/A |
| Number | Min/Max Value | N/A |
| Date | Min/Max Date | DD/MM/YYYY |
| Time | N/A | 24-Hour Format (HH:mm) |
| Choice | Comma-separated list | Selected String |
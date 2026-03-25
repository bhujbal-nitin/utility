"""
==============================================================================
  AutomationEdge AiStudio — Custom Hook Boilerplate (WhatsApp Channel)
==============================================================================

PURPOSE:
  This is the canonical boilerplate for custom_hook.py when building a
  WhatsApp chatbot on AutomationEdge AiStudio. Use this file as the exact
  structural template. Do NOT deviate from method signatures, class
  inheritance, import paths, or response formats defined here.

CRITICAL RULES (must never be violated):
  1. Class MUST inherit from ChatbotHooks.
  2. ALL methods are `async` and do NOT use `self` — they are implicitly
     static. Do NOT add `self` as a parameter to any method.
  3. `export_dialogs` must always be present as a class-level list.
  4. The `whatsapp_data_channel` method MUST always handle the "ping" action
     first, before any screen-based routing logic.
  5. WhatsApp response dicts MUST always include "version": "3.0".
  6. Use `HTTPUtils.http_post` / `HTTPUtils.http_get` for ALL async HTTP
     calls — never use `requests` library (it is synchronous).
  7. All logs go through `logger` (standard Python logging). Use
     `logger.info(...)` for traceability.
==============================================================================
"""

import logging
import json
import time

from botbuilder.dialogs import Dialog
from django.http import HttpResponse
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from aistudiobot.hooks import ChatbotHooks
from custom.helpers.custom_bot_helper import Custom_Bot_Helper
from common.http_utils import HTTPUtils

# All logs will be available in logs/custom.log
logger = logging.getLogger(__name__)


class CustomChatbotHooks(ChatbotHooks):
    """
    Central hook class for AiStudio chatbot customisation.
    All methods are async and must NOT include `self`.
    """

    # Register custom dialog objects here. Only listed dialogs will be
    # registered during execution.
    export_dialogs = []

    # -------------------------------------------------------------------------
    # CORE LIFECYCLE HOOKS
    # -------------------------------------------------------------------------

    async def root_dialog_hook(conv_state, user_state, turn_context) -> Dialog:
        """
        Invoked BEFORE trigger matching on every incoming message.
        Use this to run pre-processing logic (e.g. extracting mobile number).

        Returns:
            Dialog | None — return a Dialog object to force a custom dialog,
                            or None to continue normal trigger matching.
        """
        logger.info("Root dialog hook called")
        await Custom_Bot_Helper.get_mobilenumber(turn_context, conv_state)
        return None

    async def storecon_hook(turn_context):
        """
        Invoked for every activity BEFORE user chat history is logged.
        """
        logger.info("Storecon hook called")
        return None

    async def custom_view_hook(request) -> HttpResponse:
        """
        Invoked when the api/custom REST endpoint is called.

        Returns:
            HttpResponse — return 400 if not implemented.
        """
        logger.info("Custom view hook called")
        return HttpResponse(status=400)

    async def webchat_join_event_hook(conv_state, user_state, turn_context):
        """
        Invoked when a user starts a NEW conversation (webchat join event).
        """
        logger.info("Webchat join hook called")
        return None

    async def aistudio_dialog_element_hook(conv_state, user_state, turn_context):
        """
        Invoked BEFORE executing any dialog element in the flow designer.
        """
        logger.info("AIStudio dialog hook called")
        return None

    async def api_messages_hook(request, activity):
        """
        Invoked for every api/messages REST API call.
        """
        logger.info("api messages hook called")
        return None

    async def api_reply_hook(request, body):
        """
        Invoked for every api/reply REST API call.

        Args:
            body : JSON string body with workflow response details.
        """
        logger.info("api reply hook called")
        return None

    async def cancel_conv_hook(conv_state, user_state, turn_context):
        """
        Invoked when a conversation is cancelled.
        """
        logger.info("Cancel conversation hook called")
        return None

    # -------------------------------------------------------------------------
    # VOICE HOOKS
    # -------------------------------------------------------------------------

    async def voice_bot_start_conv_hook(request, file_data):
        """
        Invoked before sending data to start a voice call.

        Args:
            file_data : CSV file (; separator) — phone numbers and details.

        Returns:
            file_data : Optionally modified file data.
        """
        return file_data

    async def voice_init_conv_hook(conversation_id, body):
        """
        Invoked when a Voice conversation is initiated.
        """
        logger.info("Voice init conversation hook called")
        return None

    async def voice_end_conv_hook(conversation_id, request=None, activity=None):
        """
        Invoked when the user disconnects from a voice call OR the voice
        conversation times out.

        Args:
            activity : Provided only on timeout; None otherwise.
        """
        return None

    # -------------------------------------------------------------------------
    # SMS HOOKS
    # -------------------------------------------------------------------------

    async def sms_bot_start_conv_hook(body):
        """
        Invoked before a conversation is initiated for SMS.
        Can be used to choose source (bot) numbers.
        """
        logger.info("SMS bot start conversation hook called")
        return None

    async def sms_bot_reply_hook(
        request, conversation_id, activity_id, end_conversation, response_list
    ):
        """
        Invoked AFTER an SMS response list has been sent.

        Args:
            end_conversation : Boolean — marks end of SMS conversation.
            response_list    : Dict mapping message number → HttpResponse.
        """
        logger.info("SMS bot reply hook called")
        return None

    # -------------------------------------------------------------------------
    # WHATSAPP FLOWS — DATA CHANNEL HOOK
    # =========================================================================
    # THIS IS THE PRIMARY HOOK FOR WHATSAPP CHANNEL INTEGRATION.
    #
    # STRUCTURE RULES:
    #   • ALWAYS handle "ping" action FIRST — WhatsApp uses this to verify
    #     the endpoint is alive. If missed, the flow will not initialise.
    #   • Route all other logic by `flow_data["screen"]` (and optionally by
    #     a key inside `flow_data["data"]` for sub-states on the same screen).
    #   • Every return value MUST be a dict with "version": "3.0".
    #   • Ping response format  : {"version": "3.0", "data": {"status": "active"}}
    #   • Screen response format: {"version": "3.0", "screen": "<SCREEN_ID>",
    #                              "data": { <key-value pairs for the screen> }}
    # =========================================================================

    async def whatsapp_data_channel(flow_data):
        """
        Invoked inside the whatsapp/data-channel view.
        Handles WhatsApp Flows using data-exchange to fetch data dynamically.

        Args:
            flow_data (dict): Payload sent by WhatsApp.
                Expected format:
                {
                    "version": "3.0",
                    "action": "data_exchange",   # or "ping"
                    "screen": "SCREEN_NAME",
                    "data": {
                        "key1": "value1",
                        ...
                    },
                    "flow_token": "UNIQUE_FLOW_TOKEN"
                }

        Returns:
            dict: Response payload for WhatsApp.
                Ping format:
                {
                    "version": "3.0",
                    "data": {"status": "active"}
                }
                Screen format:
                {
                    "version": "3.0",
                    "screen": "TARGET_SCREEN_ID",
                    "data": { <dynamic data for the screen> }
                }
        """
        logger.info(f"WhatsApp Flows Request data - {flow_data}")

        # ------------------------------------------------------------------
        # STEP 1 — PING HANDLER (MANDATORY — always keep this block first)
        # WhatsApp sends a ping to verify the endpoint before launching a flow.
        # ------------------------------------------------------------------
        if flow_data.get("action") == "ping":
            return {"version": "3.0", "data": {"status": "active"}}

        # ------------------------------------------------------------------
        # STEP 2 — SCREEN ROUTING
        # Add one `elif` block per screen defined in your WhatsApp Flow.
        # Use flow_data["screen"] to identify the current screen.
        # Use flow_data["data"] to read the values submitted by the user.
        #
        # TEMPLATE — simple data pass-through (no external API call):
        # ------------------------------------------------------------------
        elif flow_data["screen"] == "SCREEN_ONE":
            # Read values submitted by the user on this screen
            user_value = flow_data["data"]["some_field"]

            response_data = {
                "version": "3.0",
                "screen": "NEXT_SCREEN_ID",        # ID of the screen to render next
                "data": {
                    "field_for_next_screen": user_value,
                    # Add all data keys that the NEXT screen expects
                }
            }
            logger.info(f"WhatsApp Flows Response data - {response_data}")
            return response_data

        # ------------------------------------------------------------------
        # TEMPLATE — screen that calls an AE Workflow and polls for result
        # Copy and adapt this block whenever you need to trigger an AE workflow.
        # ------------------------------------------------------------------
        elif flow_data["screen"] == "SCREEN_WITH_WORKFLOW":
            # 1. Read user inputs from the screen
            param_one = flow_data["data"]["param_one"]
            param_two = flow_data["data"]["param_two"]

            # ---- AUTHENTICATE with AE Engine ----
            auth_url = "https://<AE_HOST>/aeengine/rest/authenticate"
            auth_response = await HTTPUtils.http_post(
                auth_url,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data={"username": "<AE_USERNAME>", "password": "<AE_PASSWORD>"}
            )
            auth_response.raise_for_status()
            token = auth_response.json().get("sessionToken")

            # ---- EXECUTE AE Workflow ----
            execute_url = "https://<AE_HOST>/aeengine/rest/execute"
            workflow_body = {
                "orgCode": "<ORG_CODE>",
                "workflowName": "<WORKFLOW_NAME>",
                "userId": "<USER_ID>",
                "source": "<SOURCE_LABEL>",
                "params": [
                    {
                        "name": "paramOne",
                        "type": "String",
                        "uiControlType": "TextBox",
                        "order": 1,
                        "displayName": "Param One",
                        "value": param_one
                    },
                    {
                        "name": "paramTwo",
                        "type": "String",
                        "uiControlType": "TextBox",
                        "order": 2,
                        "displayName": "Param Two",
                        "value": param_two
                    }
                ]
            }
            execute_response = await HTTPUtils.http_post(
                execute_url,
                headers={
                    "Content-Type": "application/json",
                    "X-session-Token": token
                },
                json=workflow_body
            )
            execute_response.raise_for_status()
            automation_request_id = execute_response.json().get("automationRequestId")

            # ---- POLL until workflow reaches a terminal state ----
            poll_url = f"https://<AE_HOST>/aeengine/rest/workflowinstances/{automation_request_id}"
            TERMINAL_STATUSES = {"Complete", "Failure", "Expired", "Terminated", "Diverted"}
            poll_interval_seconds = 1
            max_wait_seconds = 180  # 3-minute timeout
            start_poll_time = time.time()
            final_status = None
            parsed_result = None  # Will hold the decoded workflow output

            while True:
                poll_response = await HTTPUtils.http_get(
                    poll_url,
                    headers={
                        "Content-Type": "application/json",
                        "X-session-Token": token
                    }
                )
                poll_response.raise_for_status()
                poll_data = poll_response.json()
                final_status = poll_data.get("status")
                logger.info(f"Workflow poll status: {final_status}")

                if final_status in TERMINAL_STATUSES:
                    workflow_response_raw = poll_data.get("workflowResponse")
                    if workflow_response_raw:
                        try:
                            # First decode: workflowResponse string → dict
                            workflow_response_json = json.loads(workflow_response_raw)
                            message_str = workflow_response_json.get("message")
                            if message_str:
                                # Second decode: message string → actual result
                                parsed_result = json.loads(message_str)
                            else:
                                parsed_result = []
                        except Exception as parse_err:
                            logger.error(f"Failed to parse workflowResponse: {parse_err}")
                            parsed_result = []
                    break  # Exit loop on terminal state

                if time.time() - start_poll_time > max_wait_seconds:
                    final_status = "Timeout"
                    parsed_result = []
                    break

                time.sleep(poll_interval_seconds)

            logger.info(f"Final workflow status: {final_status}, Result: {parsed_result}")

            # ---- Build response based on workflow output ----
            if parsed_result:
                response_data = {
                    "version": "3.0",
                    "screen": "SUCCESS_SCREEN",
                    "data": {
                        "result_list": parsed_result,
                        "status": "true"
                    }
                }
            else:
                response_data = {
                    "version": "3.0",
                    "screen": "SUCCESS_SCREEN",
                    "data": {
                        "result_list": [],
                        "status": "false"
                    }
                }

            logger.info(f"WhatsApp Flows Response data - {response_data}")
            return response_data

        # ------------------------------------------------------------------
        # TEMPLATE — screen that generates a dynamic dropdown/list from time
        # Copy and adapt this block when you need to populate a time picker.
        # ------------------------------------------------------------------
        elif flow_data["screen"] == "TIME_SCREEN":
            ist = ZoneInfo("Asia/Kolkata")
            start_time_str = flow_data["data"]["Start_Time"]
            today_ist = datetime.now(ist).date()

            start_time = datetime.strptime(start_time_str, "%I:%M %p")
            start_time = datetime.combine(today_ist, start_time.time()).replace(tzinfo=ist)

            end_boundary = datetime.combine(
                today_ist,
                datetime.strptime("12:00 AM", "%I:%M %p").time()
            ).replace(tzinfo=ist)

            if end_boundary <= start_time:
                end_boundary += timedelta(days=1)

            time_list = []
            current_time = start_time + timedelta(minutes=15)
            while current_time <= end_boundary:
                formatted_time = current_time.strftime("%I:%M %p")
                time_list.append({"id": formatted_time, "title": formatted_time})
                current_time += timedelta(minutes=15)

            response_data = {
                "version": "3.0",
                "screen": "TIME_SCREEN",
                "data": {
                    "End_Time": time_list,
                    "Status": "true"
                }
            }
            logger.info(f"WhatsApp Flows Response data - {response_data}")
            return response_data

    # -------------------------------------------------------------------------
    # CUSTOM SCHEDULES
    # -------------------------------------------------------------------------

    async def custom_schedules():
        """
        Add custom scheduled jobs to chatbot-webservice.

        Returns:
            List of Schedule objects, or None.
        """
        return None

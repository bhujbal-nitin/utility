import json
import os
from copy import deepcopy

class CardHelper:
    """
    Standard Boilerplate for generating Custom Dynamic Adaptive Cards.
    This helper builds a TableRow list from dynamic data and appends it 
    to a static JSON template.
    """
    
    @staticmethod
    def create_dynamic_card(data_list, template_filename):
        # 1. Define the Row Template (Object representing one single dynamic TableRow)
        # LLM Note: Match the number of cells to the header columns in the JSON shell.
        row_template = {
            "type": "TableRow",
            "cells": [
                { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "" }] },
                { "type": "TableCell", "items": [{ "type": "TextBlock", "text": "" }] },
                # ... add cells as needed ...
                {
                    "type": "TableCell",
                    "items": [{
                        "type": "Input.Toggle",
                        "id": "select_id_placeholder",
                        "value": "false"
                    }]
                }
            ]
        }

        # 2. Build absolute path to the JSON template shell
        # Path: D:\AiStudio\aistudio-package\addon\demo\cognibot\custom\functions\custom_json\
        template_path = os.path.join(
            os.getcwd(),
            "custom",
            "functions",
            "custom_json",
            template_filename
        )

        # 3. Load the template with UTF-8 encoding
        with open(template_path, "r", encoding="utf-8") as f:
            card_template = json.load(f)

        # 4. Iterate through data, deepcopy the row, and map values
        for item in data_list:
            row = deepcopy(row_template)
            
            # Retrieve unique ID for the selection key
            unique_id = str(item.get('id_key_name')) 

            # Map Text values to Table Cells
            # row['cells'][index]['items'][0]['text'] = str(item.get('data_key'))
            
            # Map the Dynamic ID to the Selection Toggle
            # Format MUST be f"select_{unique_id}" for submission parsing
            row['cells'][-1]['items'][0]['id'] = f"select_{unique_id}"

            # 5. Append the populated row to the Table in the body
            # body[1] is the standard index for the Table element
            card_template['body'][1]['rows'].append(row)

        # 6. Return stringified JSON
        return json.dumps(card_template)
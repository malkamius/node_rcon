from bs4 import BeautifulSoup
import json

def extract_settings_from_html(html_content, settings_template):
    soup = BeautifulSoup(html_content, 'html.parser')
    extracted_settings = json.loads(settings_template)

    # Process Game.ini settings
    game_ini_section_tag = soup.find(id="Game.ini").find_next('table')
    if game_ini_section_tag:
        for row in game_ini_section_tag.find_all('tr')[1:]:  # Skip header row
            cols = row.find_all('td')
            if len(cols) >= 4:
                variable_html = cols[2].get_text(strip=True)
                description = cols[3].get_text(strip=True)
                
                # Extract variable name, handling potential HTML tags within
                variable_name = variable_html.split("=")[0] if "=" in variable_html else variable_html.split("(")[0]

                # Clean up variable name
                variable_name = variable_name.strip().replace('[', '').replace(']', '').replace('"', '')

                # Skip blank entries
                if not variable_name:
                    continue

                # Add to the template. Assume [/Script/ShooterGame.ShooterGameMode] section for Game.ini
                if variable_name in extracted_settings["Game.ini"]["sections"]["[/Script/ShooterGame.ShooterGameMode]"]["settings"]:
                    extracted_settings["Game.ini"]["sections"]["[/Script/ShooterGame.ShooterGameMode]"]["settings"][variable_name]["description"] = description

    # Process GameUserSettings.ini settings
    game_user_settings_sections = {
        "[ServerSettings]": "[ServerSettings]",
        "[SessionSettings]": "[SessionSettings]",
        "[MultiHome]": "[MultiHome]",
        "[/Script/Engine.GameSession]": "[/Script/Engine.GameSession]",
        "[Ragnarok]": "[Ragnarok]",
        "[MessageOfTheDay]": "[MessageOfTheDay]"
    }

    for section_id, json_section_key in game_user_settings_sections.items():
        section_tag = soup.find(id=section_id.strip('[]'))
        if section_tag:
            table = section_tag.find_next('table')
            if table:
                for row in table.find_all('tr')[1:]:  # Skip header row
                    cols = row.find_all('td')
                    if len(cols) >= 4:
                        variable_html = cols[2].get_text(strip=True)
                        description = cols[3].get_text(strip=True)

                        variable_name = variable_html.split("=")[0] if "=" in variable_html else variable_html.split("(")[0]
                        variable_name = variable_name.strip().replace('[', '').replace(']', '').replace('"', '')

                        if not variable_name:
                            continue
                        
                        # Add new section to JSON if it doesn't exist
                        if json_section_key not in extracted_settings["GameUserSettings.ini"]["sections"]:
                            extracted_settings["GameUserSettings.ini"]["sections"][json_section_key] = {"settings": {}}

                        # Check if variable already exists, if not add it.
                        if variable_name not in extracted_settings["GameUserSettings.ini"]["sections"][json_section_key]["settings"]:
                            # Attempt to infer type (simplified)
                            if "bool" in description or "true" in description.lower() or "false" in description.lower():
                                var_type = "bool"
                            elif "float" in description or "multiplier" in description.lower() or "decimal" in description.lower():
                                var_type = "float"
                            elif "integer" in description or "number" in description.lower() or "seconds" in description.lower() or "slots" in description.lower():
                                var_type = "int"
                            elif "string" in description or "url" in description.lower() or "name" in description.lower() or "id" in description.lower():
                                var_type = "string"
                            else:
                                var_type = "string" # Default to string

                            # Attempt to infer default value from description or set to empty.
                            default_value = ""
                            if "Default value:" in description:
                                default_val_str = description.split("Default value:")[1].split(".")[0].strip()
                                if default_val_str.lower() == "true":
                                    default_value = True
                                elif default_val_str.lower() == "false":
                                    default_value = False
                                elif default_val_str.lower() == "n/a" or default_val_str == "":
                                    default_value = ""
                                else:
                                    try:
                                        if var_type == "float":
                                            default_value = float(default_val_str)
                                        elif var_type == "int":
                                            default_value = int(float(default_val_str)) # Handles floats like "1.0" being default for int
                                    except ValueError:
                                        default_value = default_val_str
                            
                            # Add the new setting with inferred properties
                            extracted_settings["GameUserSettings.ini"]["sections"][json_section_key]["settings"][variable_name] = {
                                "type": var_type,
                                "label": variable_name, # Can be improved by parsing label from HTML too
                                "default": default_value,
                                "description": description
                            }
                        else:
                            extracted_settings["GameUserSettings.ini"]["sections"][json_section_key]["settings"][variable_name]["description"] = description

    return extracted_settings

# Load HTML content
with open('Server configuration - ARK Official Community Wiki.htm', 'r', encoding='utf-8') as f:
    html_content = f.read()

# Load JSON template
with open('ark-settings-template.json', 'r', encoding='utf-8') as f:
    json_template = f.read()

# Extract and populate settings
updated_settings = extract_settings_from_html(html_content, json_template)

# Output the updated JSON
with open("ark-settings-gemini.json", 'w', encoding='utf-8') as f:
        json.dump(updated_settings, f, indent=2, ensure_ascii=False)
import json
import re

# Load template
with open('ark-settings-template.json', 'r', encoding='utf-8') as f:
    template = json.load(f)

def load_keys_from_txt(path):
    keys = set()
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            # if not line or line.startswith(';') or line.startswith('['):
            #     continue
            # Get key before =
            # m = re.match(r'([^=]+)=', line)
            m = re.match(r'^(?:Missing|Check mark|X mark)\.(?:png|svg).+\.(?:png|svg)\s+(\S+)\s+', line)
            if m:
                keys.add(m.group(1).strip())
    return keys

def collect_template_keys(template, ini_name):
    keys = set()
    sections = template.get(ini_name, {}).get('sections', {})
    for section, section_data in sections.items():
        for key in section_data.get('settings', {}):
            keys.add(key)
    return keys

def main():
    game_ini_keys = load_keys_from_txt('game.ini.txt')
    gus_ini_keys = load_keys_from_txt('game user settings.ini.txt')
    template_game_ini_keys = collect_template_keys(template, 'Game.ini')
    template_gus_ini_keys = collect_template_keys(template, 'GameUserSettings.ini')

    # Check for misplaced keys
    misplaced_in_game_ini = template_game_ini_keys & gus_ini_keys
    misplaced_in_gus_ini = template_gus_ini_keys & game_ini_keys

    print('Settings in template Game.ini but only in GameUserSettings.ini.txt:', misplaced_in_game_ini)
    print('Settings in template GameUserSettings.ini but only in Game.ini.txt:', misplaced_in_gus_ini)

    # Optionally, print missing keys
    missing_in_game_ini = game_ini_keys - template_game_ini_keys
    missing_in_gus_ini = gus_ini_keys - template_gus_ini_keys
    print('\nKeys in game.ini.txt not in template:', missing_in_game_ini)
    print('Keys in game user settings.ini.txt not in template:', missing_in_gus_ini)

if __name__ == '__main__':
    main()

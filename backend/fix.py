with open('app/api/control.py', 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')

with open('app/api/control.py', 'w', encoding='utf-8') as f:
    for i, line in enumerate(lines):
        if 343 <= i <= 488:
            if line.strip() == '':
                f.write(line + '\n')
            else:
                f.write(' ' * 4 + line + '\n')  # Add 4 spaces
        elif 490 <= i <= 499:
            if line.strip() == '':
                f.write(line + '\n')
            else:
                f.write(' ' * 4 + line + '\n')  # Add 4 spaces
        else:
            f.write(line + '\n')

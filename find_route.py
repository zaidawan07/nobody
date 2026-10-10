with open('src/routes/_authenticated/platform/plans.tsx', 'r') as f:
    lines = f.readlines()
    for i, line in enumerate(lines, 1):
        if 'Route' in line:
            print(f'{i}: {line.rstrip()}')

import os

def update_file(filepath):
    try:
        with open(filepath, 'r') as f:
            content = f.read()

        target = '<div id="user-links" style="display: none;">'
        replacement = '<div id="user-links" style="display: none;">\n                    <span id="welcome-msg" style="font-weight: 600; color: var(--text-color);"></span>'

        if target in content and 'id="welcome-msg"' not in content:
            new_content = content.replace(target, replacement)
            with open(filepath, 'w') as f:
                f.write(new_content)
            print(f"Updated {filepath}")
        else:
            if 'id="welcome-msg"' in content:
                print(f"Already updated {filepath}")
            else:
                print(f"Target not found in {filepath}")

    except Exception as e:
        print(f"Error updating {filepath}: {e}")

# List of files to update (same list as before)
files = [
    'index.html',
    'browse.html',
    'login.html',
    'register.html',
    'item-details.html',
    'user/dashboard.html',
    'user/create-post.html',
    'user/my-posts.html',
    'user/my-claims.html',
    'staff/dashboard.html',
    'staff/review-posts.html',
    'staff/review-claims.html',
    'admin/dashboard.html',
    'admin/manage-users.html',
    'admin/logs.html'
]

base_dir = '/home/aminur_/Desktop/Website/'
for file in files:
    filepath = os.path.join(base_dir, file)
    if os.path.exists(filepath):
        update_file(filepath)
    else:
        print(f"File not found: {filepath}")

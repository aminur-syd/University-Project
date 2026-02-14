
import os

def update_file(filepath):
    try:
        with open(filepath, 'r') as f:
            content = f.read()
        
        old_block = """                <div class="social-links">
                    <a href="#"><i class="fab fa-facebook-f"></i></a>
                    <a href="#"><i class="fab fa-twitter"></i></a>
                    <a href="#"><i class="fab fa-instagram"></i></a>
                </div>"""
        
        new_block = """                <div class="social-links">
                    <a href="#"><i class="fab fa-facebook-f"></i></a>
                    <a href="#"><i class="fa-brands fa-x-twitter"></i></a>
                    <a href="#"><i class="fab fa-instagram"></i></a>
                    <a href="#"><i class="fab fa-github"></i></a>
                    <a href="#"><i class="fab fa-linkedin-in"></i></a>
                </div>"""
        
        if old_block in content:
            new_content = content.replace(old_block, new_block)
            with open(filepath, 'w') as f:
                f.write(new_content)
            print(f"Updated {filepath}")
        else:
            print(f"Block not found in {filepath} - checking for variations")
            # Fallback for potential whitespace variations or if already updated
            if "fa-x-twitter" in content:
                 print(f"Already updated {filepath}")
            else:
                 print(f"Could not find block in {filepath}")

    except Exception as e:
        print(f"Error updating {filepath}: {e}")

# List of files to update
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

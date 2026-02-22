import os
import re

# Define the root directory
root_dir = "."

# Social media links
links = {
    "facebook": "https://facebook.com/sydneyaminur",
    "twitter": "https://x.com/sydneyaminur",
    "instagram": "https://instagram.com/aminur_syd",
    "linkedin": "http://linkedin.com/in/sydneyaminur",
    "github": "https://github.com/aminur-syd"
}

# Walk through all directories and files
for dirpath, dirnames, filenames in os.walk(root_dir):
    for filename in filenames:
        if filename.endswith(".html"):
            filepath = os.path.join(dirpath, filename)
            
            with open(filepath, "r") as f:
                content = f.read()
            
            # Update Facebook
            content = re.sub(r'<a href="[^"]*"><i class="fab fa-facebook-f"></i></a>', 
                             f'<a href="{links["facebook"]}"><i class="fab fa-facebook-f"></i></a>', content)
            
            # Update X (Twitter)
            content = re.sub(r'<a href="[^"]*"><i class="fa-brands fa-x-twitter"></i></a>', 
                             f'<a href="{links["twitter"]}"><i class="fa-brands fa-x-twitter"></i></a>', content)
            
            # Update Instagram
            content = re.sub(r'<a href="[^"]*"><i class="fab fa-instagram"></i></a>', 
                             f'<a href="{links["instagram"]}"><i class="fab fa-instagram"></i></a>', content)

            # Update GitHub
            content = re.sub(r'<a href="[^"]*"><i class="fab fa-github"></i></a>', 
                             f'<a href="{links["github"]}"><i class="fab fa-github"></i></a>', content)

            # Update LinkedIn
            content = re.sub(r'<a href="[^"]*"><i class="fab fa-linkedin-in"></i></a>', 
                             f'<a href="{links["linkedin"]}"><i class="fab fa-linkedin-in"></i></a>', content)

            with open(filepath, "w") as f:
                f.write(content)
            print(f"Updated {filepath}")

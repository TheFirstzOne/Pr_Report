import subprocess
import sys

def main():
    cmd = [
        "node",
        "C:\\Users\\Tanarat\\.gemini\\config\\skills\\impeccable\\scripts\\detect.mjs",
        "--json",
        "index.html"
    ]
    print(f"Running command: {' '.join(cmd)}")
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, cwd="C:\\Users\\Tanarat\\Desktop\\WORKS\\PROJECTS\\Stock-Management")
        print("STDOUT:")
        print(res.stdout)
        print("STDERR:")
        print(res.stderr)
        print(f"Exit code: {res.returncode}")
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    main()

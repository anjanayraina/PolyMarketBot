import os
import sys
import subprocess
import time

def main():
    root_dir = os.path.abspath(os.path.dirname(__file__))
    backend_dir = os.path.join(root_dir, "backend")
    frontend_dir = os.path.join(root_dir, "frontend")

    # Determine paths
    venv_python = os.path.join(root_dir, ".venv", "Scripts", "python.exe")
    if not os.path.exists(venv_python):
        # Fallback to standard python if venv not found at default location
        venv_python = sys.executable

    print("🚀 Starting Polymarket Insider Tracker...")

    processes = []
    try:
        # Start Backend Server (FastAPI with Uvicorn)
        print("👉 Starting backend FastAPI server on http://127.0.0.1:8000...")
        backend_cmd = [venv_python, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"]
        backend_proc = subprocess.Popen(
            backend_cmd,
            cwd=backend_dir,
            shell=True if os.name == 'nt' else False
        )
        processes.append(backend_proc)

        # Wait a short moment to let backend initialize
        time.sleep(1.5)

        # Start Frontend Server (Vite)
        print("👉 Starting frontend Vite server...")
        frontend_cmd = ["npm", "run", "dev"]
        frontend_proc = subprocess.Popen(
            frontend_cmd,
            cwd=frontend_dir,
            shell=True
        )
        processes.append(frontend_proc)

        print("\nPress Ctrl+C to stop both servers.\n")
        
        # Keep main thread alive and monitor processes
        while True:
            for p in processes:
                if p.poll() is not None:
                    print(f"\n⚠️ Process {p.args} exited with code {p.returncode}")
                    return
            time.sleep(1)

    except KeyboardInterrupt:
        print("\nStopping all servers gracefully...")
    finally:
        for p in processes:
            if p.poll() is None:
                # Terminate running subprocesses
                p.terminate()
                try:
                    p.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    p.kill()
        print("Cleaned up background processes. Goodbye!")

if __name__ == "__main__":
    main()

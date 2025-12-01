# Jupyter Lab configuration for data team agents

c = get_config()  # noqa

# Server settings
c.ServerApp.ip = '0.0.0.0'
c.ServerApp.port = 8888
c.ServerApp.open_browser = False
c.ServerApp.allow_root = True

# Authentication (disable for agent use)
c.ServerApp.token = ''
c.ServerApp.password = ''

# Directory settings
c.ServerApp.root_dir = '/workspace'
c.ServerApp.notebook_dir = '/workspace/notebooks'

# Resource limits
c.ResourceUseDisplay.mem_limit = 2 * 1024 * 1024 * 1024  # 2GB
c.ResourceUseDisplay.track_cpu_percent = True

# Kernel settings
c.KernelManager.shutdown_wait_time = 5.0

# Extension settings
c.ServerApp.nbserver_extensions = {
    'jupyterlab_git': True
}

# Logging
c.ServerApp.log_level = 'INFO'

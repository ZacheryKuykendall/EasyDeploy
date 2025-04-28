from setuptools import setup, find_packages

setup(
    name="easydeploy",
    version="0.1.0",
    packages=find_packages(),
    include_package_data=True,
    install_requires=[
        "click>=8.0.0",
        "pyyaml>=6.0",
        "requests>=2.25.0",
        "docker>=5.0.0",
        "colorama>=0.4.4",
        "tabulate>=0.8.9",
        "python-dateutil>=2.8.2",
    ],
    entry_points={
        "console_scripts": [
            "easydeploy=easydeploy.cli:cli",
        ],
    },
    author="EasyDeploy Team",
    author_email="info@easydeploy.com",
    description="Deploy applications instantly to AWS, GCP, or Azure with a single command",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    url="https://github.com/ZacheryKuykendall/EasyDeploy",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.7",
) 
#!/usr/bin/env python
# coding: utf-8

# Update Public Dashboard
import os
import requests
from datetime import datetime

render_deploy_url = os.environ["RENDER_DEPLOY"]
requests.get(render_deploy_url)

today = str(datetime.today().date())
with open("execute_date.txt", "w") as text_file:
    text_file.write(today)

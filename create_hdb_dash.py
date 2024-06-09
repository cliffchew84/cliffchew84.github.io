#!/usr/bin/env python
# coding: utf-8

# ### HDB Dashboard Creation Workflow

# In[96]:


import os
import json
import tempfile
import requests
import pygsheets
import pandas as pd
from datetime import datetime
from dateutil.relativedelta import relativedelta
import plotly.graph_objects as go


# ### Set up period to make API calls for - This month + last month

# In[3]:


current_date = datetime.today()
current_yr_mth = current_date.strftime('%Y-%m')
previous_yr_mth = (current_date - relativedelta(months=1)).strftime('%Y-%m')
api_periods_to_call = [current_yr_mth, previous_yr_mth]


# #### Make API calls to Data.gov.sg to update data

# In[4]:


df_cols = ['month', 'town', 'floor_area_sqm', 'flat_type', 'lease_commence_date', 'resale_price' ]
param_fields = ",".join(df_cols)


# In[5]:


base_url = "https://data.gov.sg/api/action/datastore_search"
url = base_url + "?resource_id=d_8b84c4ee58e3cfc0ece0d773c8ca6abc"

latest_df = pd.DataFrame()
for mth in api_periods_to_call:
    params = {
        "fields": param_fields,
        "filters": json.dumps({'month': mth}),
        "limit": 10000
    }
    response = requests.get(url, params=params)
    mth_df = pd.DataFrame(response.json().get("result").get("records"))
    latest_df = pd.concat([latest_df, mth_df], axis=0)


# ### Extract original data from Google Sheets

# In[ ]:


try:
    json_encode = os.environ['g_cred'].replace("\\\\", "\\").encode('utf-8')

    def _google_creds_as_file():
        temp = tempfile.NamedTemporaryFile()
        temp.write(json_encode)
        temp.flush()
        return temp

    creds_file = _google_creds_as_file()
    gc = pygsheets.authorize(service_account_file=creds_file.name)

except:
    google_auth = os.environ['gsheet_cred']
    api_email = os.environ["gsheet_api_email"]
    gc = pygsheets.authorize(service_file=google_auth)


# In[97]:


def open_or_create_spreadsheet(ss_name: str, print_status=True
                               ) -> pygsheets.Spreadsheet:
    """
    Opens Spreadsheet by name.
    If Spreadsheet doesn't exist, create it.
    """
    try:
        if print_status:
            print("Accessing {}".format(ss_name))
        sheet = gc.open(ss_name)

    except Exception:
        if print_status:
            print("{} doesn't exist.\nCreating it now".format(ss_name))

        # Create new spreadsheet
        gc.sheet.create(ss_name)
        sheet = gc.open(ss_name)

        # Share my API email and personal email
        sheet.share(api_email, role='writer', type='user')
        sheet.share('cliffchew84@gmail.com', role='writer', type='user')

        # Share to all for reading
        sheet.share('', role='reader', type='anyone')

    print(f"Spreadsheet link: {sheet.url}")
    return sheet


def open_or_create_worksheet(sheet: pygsheets.Spreadsheet,
                             ws_name: str,
                             print_status=True
                             ) -> pygsheets.Worksheet:
    """
    Tries to open a Google Worksheet by name.
    If the worksheet doesn't exist, create it.
    """
    try:
        sheet.add_worksheet(ws_name, rows=10000, cols=26)
        if print_status:
            print("{} doesn't exist.\nCreating it now.\n".format(ws_name))

    except Exception:
        if print_status:
            print("Accessing {} Worksheet".format(ws_name))

    ws = sheet.worksheet_by_title(ws_name)
    if print_status:
        print(f"Spreadsheet link: {sheet.url}")

    return ws


# In[98]:


sheet = open_or_create_spreadsheet("HDB")


# #### Extract data from Google Sheets 

# In[99]:


df_list = list()

for wk in ['2013-2018', '2019-2023', '2024']:
    ws = open_or_create_worksheet(sheet, wk)
    df_tmp = ws.get_as_df()
    df_list.append(df_tmp)


# In[100]:


df = pd.concat(df_list)
df.shape


# In[102]:


# Rm last 2 months data from df
df = df[~df.month.isin(api_periods_to_call)]
print(df.shape)

# Add updated data into df
df = pd.concat([df, latest_df])

# Create year for filtering later on
df['year'] = [i.split('-')[0] for i in df['month']]
df = df.sort_values('month').reset_index(drop=True)
df.shape


# ### Clear Latest Google Sheets table

# In[92]:


ws = open_or_create_worksheet(sheet, '2024')
rows = ws.rows
cols = ws.cols

end_cell = pygsheets.utils.format_addr((rows, cols))
end_cell

# Clear all information in the worksheet by specifying the entire range
ws.clear(start='A1', end=end_cell)


# ### Load updated data into Google Sheets 

# In[93]:


df_tmp = df[df['year'] == '2024']
del df_tmp['year']

ws = open_or_create_worksheet(sheet, '2024')
ws.set_dataframe(df_tmp, (1,1))


# ### Data Processing for creating charts 

# In[21]:


df['yr_q'] = [str(i) for i in pd.to_datetime(df['month']).dt.to_period('Q')]
df['count'] = 1
df.rename(columns={'resale_price':'price'}, inplace=True)
df.price = df.price.astype(float)

# Create price categories
bins = [0, 300000, 500000, 800000, 1000000, 2000000]
labels = ["<=300k", "300-500k", "500-800k", "800k-1m", ">=1m"]
df["price_grp"] = pd.cut(df["price"], bins=bins, labels=labels, right=False)

chart_width = 1000
chart_height = 600


# ### My Graphs
# 1. [Home Price Distributions](#Home-price-distributions) - Tracking price distribution of public homes sold
# 1. [Advanced Million Dollar Homes](#Advanced-Million-Dollar-Homes) - Tracking million dollar homes and their porportions
# 1. [Stacked Bar Values](#Stacked-Bar-Values) - Tracking number of public homes sold by their price brackets
# 1. [Stacked Bar Percentage](#Stacked-Bar-Percentage) - Tracking proportion of public homes sold by their price brackets

# ### Home price distributions
# #### [Back to My Graphs](#My-Graphs)

# In[32]:


period = 'yr_q'
fig = go.Figure()
for p in df[period].drop_duplicates():
    fig.add_trace(go.Box(y=df[df[period] == p].price, name=str(p)))

fig.update_layout(
    title='By Quarters - Public Home Price Distributions From 2013',
    yaxis={"title": "Home Prices"},
    xaxis={"title": "Quarters"},
    width=chart_width, height=chart_height,
    showlegend=False,
)

fig.write_html("profile/assets/charts/qtr_boxplot.html")
# fig.show()


# In[33]:


period = 'month'
fig = go.Figure()

mth_df = df[df.yr_q >= '2020Q1']
for p in mth_df[period].drop_duplicates():
    fig.add_trace(go.Box(y=mth_df[mth_df[period] == p].price, name=str(p)))

fig.update_layout(
    title='By Months - Public Home Price Distributions From 2020',
    yaxis={"title": "Home Prices"},
    xaxis={"title": "Months"},
    width=chart_width, height=chart_height,
    showlegend=False,
)

fig.write_html("profile/assets/charts/mth_boxplot.html")
# fig.show()


# ### Advanced Million Dollar Homes
# #### [Back to My Graphs](#My-Graphs)

# In[42]:


period = 'yr_q'
df['mil'] = [1 if i >= 1000000 else 0 for i in df['price']]
for_plot = df.groupby([period, 'mil'])['town'].count().reset_index().sort_values(period)
cal_ = for_plot.pivot_table(index=period, values='town', columns='mil', 
                            margins=True, aggfunc="sum").reset_index().fillna(0)

for i in [0, 1, 'All']:
    cal_[i] = cal_[i].astype(int)

cal_['proportion'] = [round(i,2) for i in cal_[1] / cal_['All'] * 100]
cal_mil_ts = cal_[cal_[period] != 'All'].reset_index(drop=True)
cal_mil_ts.columns = [period, '0', 'million $ Trans', 'Total Trans', '% million Trans']


# In[35]:


from plotly.subplots import make_subplots
fig = make_subplots(specs=[[{"secondary_y": True}]])

title = "By Quarters - % of Million Dollar Public Home Sales [Line] & Total Sales Public Home Sales [Bar] "
fig.add_trace(go.Scatter(
    x=cal_mil_ts[period], 
    y=cal_mil_ts['% million Trans'],
    mode='lines+markers',
    name="%"), 
secondary_y=False)

fig.add_trace(go.Bar(
    x=cal_mil_ts[period],
    y=cal_mil_ts['0'],
    opacity=.4,
    name="Total Sales"),
secondary_y=True)

fig.update_layout(
    title=title,
    hovermode="x unified",
    xaxis={"title": "Quarters"},
    width=chart_width, height=chart_height,
    legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
)

fig.update_yaxes(title_text="% Million Dollar Homes to Overall Sales", secondary_y=False)
fig.update_yaxes(title_text="Total Sales", secondary_y=True)

fig.add_hline(y=1, line_width=1.5, line_dash="dash", line_color="black")
fig.add_hline(y=1.5, line_width=1.5, line_dash="dash", line_color="red")

fig.write_html("profile/assets/charts/qtr_barline_chart.html")
# fig.show()


# In[36]:


period = 'month'
df['mil'] = [1 if i >= 1000000 else 0 for i in df['price']]
for_plot = df[df.yr_q >= '2020Q1'].groupby([period, 'mil'])['town'].count().reset_index().sort_values(period)
cal_ = for_plot.pivot_table(index=period, values='town', columns='mil', 
                            margins=True, aggfunc="sum").reset_index().fillna(0)

for i in [0, 1, 'All']:
    cal_[i] = cal_[i].astype(int)

cal_['proportion'] = [round(i,2) for i in cal_[1] / cal_['All'] * 100]
cal_mil_ts = cal_[cal_[period] != 'All'].reset_index(drop=True)
cal_mil_ts.columns = [period, '0', 'million $ Trans', 'Total Trans', '% million Trans']


# In[37]:


from plotly.subplots import make_subplots
fig = make_subplots(specs=[[{"secondary_y": True}]])

title = "By Months - % of Million Dollar Public Home Sales [Line] & Total Sales Public Home Sales [Bar] "
fig.add_trace(go.Scatter(
    x=cal_mil_ts[period], 
    y=cal_mil_ts['% million Trans'],
    mode='lines+markers',
    name="%"), 
secondary_y=False)

fig.add_trace(go.Bar(
    x=cal_mil_ts[period],
    y=cal_mil_ts['0'],
    opacity=.4,
    name="Total Sales"),
secondary_y=True)

fig.update_layout(
    title=title,
    hovermode="x unified",
    xaxis={"title": "Months"},
    width=chart_width, height=chart_height,
    legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
)

fig.update_yaxes(title_text="% Million Dollar Homes to Overall Sales", secondary_y=False)
fig.update_yaxes(title_text="Total Sales", secondary_y=True)

fig.add_hline(y=1, line_width=1.5, line_dash="dash", line_color="black")
fig.add_hline(y=1.5, line_width=1.5, line_dash="dash", line_color="red")

fig.write_html("profile/assets/charts/mth_barline_chart.html")
# fig.show()


# ### Stacked Bar Values
# #### [Back to My Graphs](#My-Graphs)

# In[38]:


period = 'yr_q'
price_grp_plots = df.groupby([period, 'price_grp'])['count'].sum().reset_index()

fig = go.Figure()
data = list()
for i in price_grp_plots.price_grp.drop_duplicates().tolist():
    fig.add_trace(go.Bar(name=i, 
                         x=price_grp_plots[price_grp_plots.price_grp == i][period].tolist(), 
                         y=price_grp_plots[price_grp_plots.price_grp == i]['count'].tolist()
                        )
                 )

fig.update_layout(
    barmode='stack',
    xaxis={'title':'Quarters'},
    yaxis={'title':'Count'},
    hovermode="x unified",
    title="By Quarters - No. of Public Home Resales by Price Categories from 2013",
    width=chart_width, height=chart_height,
    legend=dict(
        orientation="h",
        yanchor="bottom",
        y=1.02,
        xanchor="right",
        x=1
))

fig.write_html("profile/assets/charts/qtr_stack_bar_values.html")
# fig.show()


# In[39]:


period = 'month'
price_grp_plots = df[df.yr_q >= '2020Q1'].groupby([period, 'price_grp'])['count'].sum().reset_index()

fig = go.Figure()
data = list()
for i in price_grp_plots.price_grp.drop_duplicates().tolist():
    fig.add_trace(go.Bar(name=i, 
                         x=price_grp_plots[price_grp_plots.price_grp == i][period].tolist(), 
                         y=price_grp_plots[price_grp_plots.price_grp == i]['count'].tolist()
                        )
                 )

fig.update_layout(
    barmode='stack',
    xaxis={'title':'Months'},
    yaxis={'title':'Count'},
    hovermode="x unified",
    title="By Months - No. of Public Home Resales by Price Categories from 2020",
    width=chart_width, height=chart_height,
    legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
)

fig.write_html("profile/assets/charts/mth_stack_bar_values.html")
# fig.show()


# ### Stacked Bar Percentage
# #### [Back to My Graphs](#My-Graphs)

# In[40]:


period = 'yr_q'
price_grp_base = df.groupby(period)['count'].sum().reset_index()
price_grp_plots = df.groupby([period, 'price_grp'])['count'].sum().reset_index()
price_grp_plots_v2 = price_grp_plots.merge(price_grp_base, on=period)
price_grp_plots_v2.columns = [period, 'price_grp', 'count', 'total']
price_grp_plots_v2['percent_count'] = [round(i * 100, 1) for i in price_grp_plots_v2['count'] / price_grp_plots_v2['total']]

fig = go.Figure()
data = list()
for i in price_grp_plots_v2.price_grp.drop_duplicates().tolist():
    fig.add_trace(go.Bar(name=i, 
                         x=price_grp_plots_v2[price_grp_plots_v2.price_grp == i][period].tolist(), 
                         y=price_grp_plots_v2[price_grp_plots_v2.price_grp == i]['percent_count'].tolist(),
                        ))
fig.add_hline(y=50, line_width=1.5, line_dash="dash", line_color="purple")
fig.update_layout(
    barmode='stack', 
    title="By Quarters - % of Public Home Sales by Price Categories from 2013",
    xaxis={'title':'Quarters'},
    yaxis={'title':'%'},
    hovermode="x unified",
    width=chart_width, height=chart_height,
    legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
)

fig.write_html("profile/assets/charts/qtr_stack_bar_percent.html")
# fig.show()


# In[41]:


period = 'month'
mth_df = df[df.yr_q >= '2020Q1']
price_grp_base = mth_df.groupby(period)['count'].sum().reset_index()
price_grp_plots = mth_df.groupby([period, 'price_grp'])['count'].sum().reset_index()
price_grp_plots_v2 = price_grp_plots.merge(price_grp_base, on=period)
price_grp_plots_v2.columns = [period, 'price_grp', 'count', 'total']
price_grp_plots_v2['percent_count'] = [round(i * 100, 1) for i in price_grp_plots_v2['count'] / price_grp_plots_v2['total']]

fig = go.Figure()
data = list()
for i in price_grp_plots_v2.price_grp.drop_duplicates().tolist():
    fig.add_trace(go.Bar(name=i, 
                         x=price_grp_plots_v2[price_grp_plots_v2.price_grp == i][period].tolist(), 
                         y=price_grp_plots_v2[price_grp_plots_v2.price_grp == i]['percent_count'].tolist(),
                        ))
fig.add_hline(y=50, line_width=1.5, line_dash="dash", line_color="purple")
fig.update_layout(
    barmode='stack', 
    title="By Months - % of Public Home Sales by Price Categories from 2013",
    xaxis={'title':'Months'},
    yaxis={'title':'%'},
    hovermode="x unified",
    width=chart_width, height=chart_height,
    legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
)

fig.write_html("profile/assets/charts/mth_stack_bar_percent.html")
# fig.show()


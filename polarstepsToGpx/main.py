import click
from datetime import datetime
import requests
import time
from urllib.parse import urlparse, parse_qs
import xml.etree.ElementTree as ET


@click.command()
@click.option(
    "--input",
    help="Input Url of your polarsteps trip",
    required=True,
)
@click.option(
    "--output",
    default="report.gpx",
    help="Gpx Filename. By default 'report.gpx'",
)
@click.option(
    "--data-source",
    default="combined",
    help="Option is 'steps' or 'localisation' or 'combined' to build gpx with steps data or full polarsteps tracking "
         "data. By default, the option is 'combined'",
)
@click.option(
    "--from-date",
    type=click.DateTime(formats=["%Y-%m-%d"]),
    help="Optionally Define the start date to be able to filter only a specific part of the trip."
         " Format is YYYY-MM-DD.",
)
@click.option(
    "--to-date",
    type=click.DateTime(formats=["%Y-%m-%d"]),
    help="Optionally Define the end date to be able to filter only a specific part of the trip. "
         "Format is YYYY-MM-DD.",
)
@click.option(
    "--include-step-data",
    type=bool,
    default=True,
    help="Include step name and description as gpx waypoint."
         " If false, waypoints will be defined with polarsteps tracker locality."
         " By default, the option is 'True'",
)
def cli(input: str, output: str, data_source: str, from_date: datetime, to_date: datetime, include_step_data: bool) -> None:
    id_value, secret_value = extract_id_and_secret(input)

    if id_value:
        response = requests.get(build_trip_url(id_value, secret_value), headers={"polarsteps-api-version": "62"})

        if response.status_code == 200:
            data = response.json()
            log("✅  Polarsteps Trip data downloaded", color="green", bold=True)
            log("Compute Steps Data")
            steps_data = {}
            localisation_data = {}
            for step in data['steps']:
                location = step['location']
                step_time = step['start_time']
                if not (from_date and step_time < from_date or to_date and step_time > to_date):
                    step_name = step['display_name'] if include_step_data else location['locality']
                    step_description = step['description'] if include_step_data else None
                    steps_data[step_time] = {'lat': location['lat'], 'lon': location['lon'],
                                             'step_name': step_name, 'step_description': step_description}
            log("Compute Localisation Data")
            for step in data['zelda_steps']:
                location = step['location']
                step_time = step['time']
                if not (from_date and step_time < from_date or to_date and step_time > to_date):
                    localisation_data[step_time] = {'lat': location['lat'], 'lon': location['lon']}

            if data_source == "steps":
                build_gpx(steps_data, output)
            elif data_source == "localisation":
                build_gpx(localisation_data, output)
            else:
                localisation_data.update(steps_data)
                build_gpx(localisation_data, output)

        else:
            log("❌ Cannot download polarsteps data from url, please verify than your trip url is valid.\n If the trip "
                "is private, the url must contain secret parameter 's'.",
                color="red", bold=True)
    else:
        log("❌ The input url is not valid. Your url must contain trip id. Eg: https://www.polarsteps.com/{"
            "accountName}/{tripId}-{trip-name}?s={Secret}",
            color="red", bold=True)


def extract_id_and_secret(url):
    parsed_url = urlparse(url)
    path_parts = parsed_url.path.strip("/").split("/")

    if len(path_parts) >= 2:
        trip_part = path_parts[1]
        if "-" in trip_part:
            id_value = trip_part.split("-")[0]
        else:
            id_value = None
    else:
        id_value = None

    query_params = parse_qs(parsed_url.query)
    secret_value = query_params.get("s", [None])[0]

    return id_value, secret_value


def build_trip_url(trip_id, secret=None):
    base_url = f"https://api.polarsteps.com/trips/{trip_id}"
    if secret:
        return f"{base_url}?s={secret}"
    else:
        return base_url


def log(message: str, color: str = "white", bold: bool = False) -> None:
    """Helper function to format messages."""
    click.echo(click.style(f"[{time.strftime('%H:%M:%S')}] {message}", fg=color, bold=bold))


def build_gpx(data: dict, output: str):
    gpx = ET.Element('gpx')
    name = ET.SubElement(gpx, 'name')
    name.text = 'Export Gpx from Polarsteps Data'
    trk = ET.SubElement(gpx, 'trk')
    trkseg = ET.SubElement(trk, 'trkseg')
    for step in sorted(data):
        trkpt = ET.SubElement(trkseg, 'trkpt', lat=str(data[step]['lat']), lon=str(data[step]['lon']))
        ET.SubElement(trkpt, 'time').text = step
        if 'step_name' in data[step]:
            wpt = ET.SubElement(gpx, 'wpt', lat=str(data[step]['lat']), lon=str(data[step]['lon']))
            ET.SubElement(wpt, 'time').text = step
            ET.SubElement(wpt, 'name').text = data[step]['step_name']
            if 'step_description' in data[step]:
                ET.SubElement(wpt, 'desc').text = data[step]['step_description']
    tree = ET.ElementTree(gpx)
    tree.write(output)


if __name__ == "__main__":
    cli()

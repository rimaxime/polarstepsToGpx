// click -> html form
// time/datetime -> new Date()
// requests -> fetch
// urllib -> URL.parse
// ET -> xml DOM

async function cli(
  input,
  output,
  data_source,
  from_date,
  to_date,
  include_step_data
) {
  const { id_value, secret_value } = extract_id_and_secret(input);

  if (id_value) {
    try {
      const response = await fetch(build_trip_url(id_value, secret_value), {
        headers: {
          "polarsteps-api-version": "62"  },
      });

      if (response.ok) {
        const data = await response.json();
        log("✅ Polarsteps Trip data downloaded", "green", true);

        const { localisation_data, steps_data } = extract_polarsteps_data(
          data,
          include_step_data,
          from_date,
          to_date
        );

        let gpxData;
        if (data_source === "steps") {
          gpxData = build_gpx(steps_data);
        } else if (data_source === "localisation") {
          gpxData = build_gpx(localisation_data);
        } else {
          gpxData = build_gpx({ ...localisation_data, ...steps_data });
        }

        const blob = new Blob([gpxData], { type: "application/gpx+xml" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = output;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        log("✅ Done", "green", true);
      } else {
        log(
          "❌ Cannot download Polarsteps data from url, please verify your trip url is valid.\nIf the trip is private, the url must contain secret parameter 's'.",
          "red",
          true
        );
      }
    } catch (err) {
      log(`❌ Fetch failed: ${err}`, "red", true);
    }
  } else {
    log(
      "❌ The input url is not valid. Your url must contain trip id. Eg: https://www.polarsteps.com/{accountName}/{tripId}-{trip-name}?s={Secret}",
      "red",
      true
    );
  }
}

function extract_polarsteps_data(data, include_step_data, from_date, to_date) {
  // Extract polarsteps data needed for the gpx file
  const steps_data = {};
  const localisation_data = {};
  log("Compute Steps Data");

  for (const step of data["steps"] || []) {
    const location = step["location"];
    const step_time_str = step["start_time"];
    const step_time = new Date(step_time_str);

    if (
      !(
        (from_date && step_time < from_date) ||
        (to_date && step_time > to_date)
      )
    ) {
      const step_name = include_step_data
        ? step["display_name"]
        : location["locality"];
      const step_description = include_step_data ? step["description"] : null;
      steps_data[step_time_str] = {
        lat: location["lat"],
        lon: location["lon"],
        step_name,
        step_description,
      };
    }
  }

  log("Compute Localisation Data");
  for (const step of data["zelda_steps"] || []) {
    const location = step["location"];
    const step_time_str = step["time"];
    const step_time = new Date(step_time_str);

    if (
      !(
        (from_date && step_time < from_date) ||
        (to_date && step_time > to_date)
      )
    ) {
      localisation_data[step_time_str] = {
        lat: location["lat"],
        lon: location["lon"],
      };
    }
  }

  return { localisation_data, steps_data };
}

function extract_id_and_secret(url) {
  // Identify trip id and secret from polarsteps sharing trip url
  const parsed_url = new URL(url);
  const path_parts = parsed_url.pathname.replace(/^\/+|\/+$/g, "").split("/");

  let id_value = null;
  if (path_parts.length >= 2) {
    const trip_part = path_parts[1];
    if (trip_part.includes("-")) {
      id_value = trip_part.split("-")[0];
    }
  }

  const secret_value = parsed_url.searchParams.get("s") || null;
  return { id_value, secret_value };
}

function build_trip_url(trip_id, secret) {
  // Generate api trip url from trip id and secret
  const proxy = "https://polarstepsproxy.rimaxime.workers.dev/?target=";
  let base_url = proxy + `https://api.polarsteps.com/trips/${trip_id}`;
  if (secret) {
    base_url += `?s=${secret}`;
  }
  return base_url;
}

function log(message, color, bold) {
  // Helper function to format messages.
  const styleParts = [];
  if (color) styleParts.push(`color:${color}`);
  if (bold) styleParts.push(`font-weight:bold`);
  const style = styleParts.join(";");

  console.log(
    `%c[${new Date().toTimeString().split(" ")[0]}] ${message}`,
    style
  );

  // Log messages in UI
  const logDiv = document.createElement("div");
  logDiv.textContent = `[${
    new Date().toTimeString().split(" ")[0]
  }] ${message}`;
  logDiv.style.color = color || "white";
  logDiv.style.fontWeight = bold ? "bold" : "normal";
  document.getElementById("log").appendChild(logDiv);
}

function build_gpx(data) {
  // Create gpx file from extracted polarsteps data.
  const doc = document.implementation.createDocument("", "", null);
  const gpx = doc.createElement("gpx");
  gpx.setAttribute("version", "1.1");
  gpx.setAttribute("creator", "Polarsteps Export JS");

  const name = doc.createElement("name");
  name.textContent = "Export Gpx from Polarsteps Data";
  gpx.appendChild(name);

  const trk = doc.createElement("trk");
  const trkseg = doc.createElement("trkseg");

  const sortedKeys = Object.keys(data).sort();

  for (const step of sortedKeys) {
    const entry = data[step];
    const trkpt = doc.createElement("trkpt");
    trkpt.setAttribute("lat", entry.lat.toString());
    trkpt.setAttribute("lon", entry.lon.toString());

    const timeEl = doc.createElement("time");
    timeEl.textContent = step;
    trkpt.appendChild(timeEl);
    trkseg.appendChild(trkpt);

    if (entry.step_name) {
      const wpt = doc.createElement("wpt");
      wpt.setAttribute("lat", entry.lat.toString());
      wpt.setAttribute("lon", entry.lon.toString());

      const wptTime = doc.createElement("time");
      wptTime.textContent = step;
      wpt.appendChild(wptTime);

      const wptName = doc.createElement("name");
      wptName.textContent = entry.step_name;
      wpt.appendChild(wptName);

      if (entry.step_description) {
        const desc = doc.createElement("desc");
        desc.textContent = entry.step_description;
        wpt.appendChild(desc);
      }
      gpx.appendChild(wpt);
    }
  }

  trk.appendChild(trkseg);
  gpx.appendChild(trk);
  doc.appendChild(gpx);

  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}

function generate() {
  // Entry point for button
  const input = document.getElementById("input").value;
  const output = document.getElementById("output").value || "report.gpx";
  const data_source = document.getElementById("data-source").value;

  const from_date_val = document.getElementById("from-date").value;
  const to_date_val = document.getElementById("to-date").value;
  const from_date = from_date_val ? new Date(from_date_val) : null;
  const to_date = to_date_val ? new Date(to_date_val) : null;

  const include_step_data =
    document.getElementById("include-step-data").checked;

  if (!input) {
    log(
      "❌ The input url is not valid. Your url must contain trip id. Eg: https://www.polarsteps.com/{accountName}/{tripId}-{trip-name}?s={Secret}",
      "red",
      true
    );
    return;
  }
  cli(input, output, data_source, from_date, to_date, include_step_data);
}

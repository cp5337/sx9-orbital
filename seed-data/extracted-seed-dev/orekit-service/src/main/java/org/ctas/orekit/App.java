package org.ctas.orekit;

import static spark.Spark.*;
import com.google.gson.*;
import org.orekit.frames.FramesFactory;
import org.orekit.time.AbsoluteDate;
import org.orekit.utils.IERSConventions;
import org.orekit.bodies.OneAxisEllipsoid;
import org.orekit.frames.TopocentricFrame;
import org.orekit.bodies.GeodeticPoint;
import org.orekit.models.earth.Geoid;
import org.orekit.models.earth.ReferenceEllipsoid;
import org.orekit.frames.Frame;
import org.orekit.time.TimeScalesFactory;

public class App {
    static class AccessRequest {
        public double latDeg;
        public double lonDeg;
        public double altM;
        public String startIso; // e.g., 2025-10-25T16:00:00Z
        public String endIso;
        // TODO: accept TLE/ephemeris; this is a stub
    }
    public static void main(String[] args) {
        port(8088);
        get("/health", (req, res) -> "ok");
        post("/access", (req, res) -> {
            res.type("application/json");
            Gson gson = new Gson();
            AccessRequest a = gson.fromJson(req.body(), AccessRequest.class);
            // Minimal scaffold: construct site frame; actual access check TBD
            Frame itrf = FramesFactory.getITRF(IERSConventions.IERS_2010, true);
            OneAxisEllipsoid wgs84 = ReferenceEllipsoid.getWgs84(itrf);
            GeodeticPoint gp = new GeodeticPoint(Math.toRadians(a.latDeg), Math.toRadians(a.lonDeg), a.altM);
            TopocentricFrame site = new TopocentricFrame(wgs84, gp, "site");
            AbsoluteDate t0 = new AbsoluteDate(a.startIso, TimeScalesFactory.getUTC());
            AbsoluteDate t1 = new AbsoluteDate(a.endIso, TimeScalesFactory.getUTC());
            JsonObject out = new JsonObject();
            out.addProperty("status","stub");
            out.addProperty("siteFrame", site.getName());
            out.addProperty("start", t0.toString());
            out.addProperty("end", t1.toString());
            return out.toString();
        });
    }
}

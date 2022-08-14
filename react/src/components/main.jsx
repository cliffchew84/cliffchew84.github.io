import { useState, useEffect } from "react";
import { Navigation } from "./navigation";
import { Header } from "./header";
import { WhyCare } from "./whycare";
import { About } from "./about";
import { Philosophy } from "./philosophy";
// import { Gallery } from "./gallery";
// import { Testimonials } from "./testimonials";
import { Team } from "./Team";
import { SignUp } from "./signup";

import JsonData from "../data/data.json";
import SmoothScroll from "smooth-scroll";
import "./App.css";

export const scroll = new SmoothScroll('a[href*="#"]', {
  speed: 1000,
  speedAsDuration: true,
});

const Main = () => {
  const [landingPageData, setLandingPageData] = useState({});
  useEffect(() => {
    setLandingPageData(JsonData);
  }, []);

  return (
    <div>
      <div>
        <Navigation /> 
        <Header data={landingPageData.Header} />
        <WhyCare data={landingPageData.WhyCare} />
        <About data={landingPageData.About} />
        <Philosophy data={landingPageData.Philosophy} />
        {/* <Gallery data={landingPageData.Gallery}/> */}
        {/* <Testimonials data={landingPageData.Testimonials} /> */}
        <Team data={landingPageData.Team} />
        <SignUp data={landingPageData.SignUp} />
      </div>
    </div>
  );
};

export default Main;

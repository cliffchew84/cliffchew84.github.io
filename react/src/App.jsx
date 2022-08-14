import Main from "./components/main";
import Abt from "./components/abt";
import { Route, Routes } from "react-router-dom";

const App = () => {
  return (
    <div>
        <Routes>
          <Route exact path="/" element={< Main />} />
          <Route exact path="abt" element={< Abt />} />
        </Routes>
    </div>
  );
};

export default App;

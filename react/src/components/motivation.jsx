export const Motivation = (props) => {
  return (
    <div id="about">
      <div className="container">
        <div className="row">
          {/* <div className="col-xs-12 col-md-6">
            {" "}
            <img src="img/about.jpg" className="img-responsive" alt="" />{" "}
          </div> */}
          <div className="col-xs-12 col-md-12">
            
              <div className="para-text">
                <p>{props.data ? props.data.paragraph : "loading..."}</p>
              </div>
            
          </div>
        </div>
      </div>
    </div>
  );
};
